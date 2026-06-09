"""Custom (AI-generated) widget CRUD against SQLite. Hand-written SQL, no ORM.

Source-code validation lives here so it can't be bypassed by a router skipping
a check. It is deliberately *not* a security sandbox — see CLAUDE.md / the
"single-user, no auth, local use" constraint. The checks below catch the
realistic failure mode (the LLM producing code that won't compile, doesn't
match the widget contract, or pokes at browser globals it has no business
touching), not a determined attacker.
"""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime

from app.schemas.custom_widget import CustomWidgetCreate, CustomWidgetOut

KEY_PREFIX = "ai_"
_MAX_SOURCE_LEN = 8192

# A custom widget must be a single arrow function or function expression that
# destructures `widget` from its props — matching the WidgetProps contract
# (frontend/src/components/widgets/registry.ts). No imports, no statements
# outside the function body.
_SHAPE_RE = re.compile(
    r"^\s*"
    r"(?:function\s+\w*\s*\(\s*\{\s*widget\s*\}\s*\)|"
    r"\(\s*\{\s*widget\s*\}\s*\)\s*=>)"
    r"\s*\{",
    re.DOTALL,
)

# Substrings that have no legitimate use in a presentational widget that only
# ever receives `widget.config` as input — if the model reaches for these it's
# either hallucinating capabilities the sandbox doesn't have, or doing
# something a local widget shouldn't (network calls, storage, raw DOM/HTML).
_DENYLIST = (
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "eval(",
    "Function(",
    "import(",
    "require(",
    "document.",
    "window.",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "cookie",
    "dangerouslySetInnerHTML",
    "<script",
)


class CustomWidgetError(Exception):
    """Domain error raised for invalid custom-widget operations."""


def _row_to_widget(row: sqlite3.Row) -> CustomWidgetOut:
    return CustomWidgetOut(
        id=row["id"],
        key=row["key"],
        name=row["name"],
        description=row["description"],
        source_code=row["source_code"],
        status=row["status"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return slug or "widget"


def _unique_key(conn: sqlite3.Connection, name: str) -> str:
    base = f"{KEY_PREFIX}{_slugify(name)}"
    key = base
    suffix = 2
    while conn.execute("SELECT 1 FROM custom_widgets WHERE key = ?", (key,)).fetchone():
        key = f"{base}_{suffix}"
        suffix += 1
    return key


def validate_source(code: str) -> None:
    """Raise CustomWidgetError if the source code fails the static contract checks."""
    if len(code) > _MAX_SOURCE_LEN:
        raise CustomWidgetError(
            f"source code is too long ({len(code)} chars, max {_MAX_SOURCE_LEN})"
        )
    if not _SHAPE_RE.match(code):
        raise CustomWidgetError(
            "source code must be a single function of the shape "
            "`({ widget }) => { ... }` or `function Widget({ widget }) { ... }` "
            "— no imports, no statements outside the function"
        )
    for needle in _DENYLIST:
        if needle in code:
            raise CustomWidgetError(
                f"source code contains disallowed reference: {needle!r} — "
                "custom widgets may only render from `widget.config`, no "
                "network, storage, or raw DOM access"
            )


def list_custom_widgets(conn: sqlite3.Connection) -> list[CustomWidgetOut]:
    rows = conn.execute("SELECT * FROM custom_widgets ORDER BY id ASC").fetchall()
    return [_row_to_widget(r) for r in rows]


def list_keys(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute("SELECT key FROM custom_widgets WHERE status = 'active' ORDER BY id ASC")
    return [r["key"] for r in rows]


def get_by_key(conn: sqlite3.Connection, key: str) -> CustomWidgetOut | None:
    row = conn.execute("SELECT * FROM custom_widgets WHERE key = ?", (key,)).fetchone()
    return _row_to_widget(row) if row else None


def create_custom_widget(
    conn: sqlite3.Connection, data: CustomWidgetCreate
) -> CustomWidgetOut:
    validate_source(data.source_code)
    key = _unique_key(conn, data.name)
    cur = conn.execute(
        """
        INSERT INTO custom_widgets (key, name, description, source_code, status)
        VALUES (?, ?, ?, ?, 'active')
        """,
        (key, data.name, data.description, data.source_code),
    )
    new_id = cur.lastrowid
    assert new_id is not None
    result = get_by_key(conn, key)
    assert result is not None
    return result


def delete_custom_widget(conn: sqlite3.Connection, widget_id: int) -> bool:
    cur = conn.execute("DELETE FROM custom_widgets WHERE id = ?", (widget_id,))
    return cur.rowcount > 0


def numbered_source(source_code: str) -> str:
    """Render source with `cat -n` style line-number prefixes for the agent to target edits."""
    lines = source_code.splitlines()
    width = len(str(len(lines)))
    return "\n".join(f"{i:>{width}}\t{line}" for i, line in enumerate(lines, start=1))


def _save_edited_source(
    conn: sqlite3.Connection, widget: CustomWidgetOut, new_source: str
) -> CustomWidgetOut:
    validate_source(new_source)
    conn.execute(
        "UPDATE custom_widgets SET source_code = ?, updated_at = datetime('now') WHERE id = ?",
        (new_source, widget.id),
    )
    result = get_by_key(conn, widget.key)
    assert result is not None
    return result


def edit_by_lines(
    conn: sqlite3.Connection, key: str, start_line: int, end_line: int, new_code: str
) -> CustomWidgetOut:
    """Replace the inclusive line range [start_line, end_line] (1-indexed) with new_code."""
    widget = get_by_key(conn, key)
    if widget is None:
        raise CustomWidgetError(f"no custom widget with key {key!r}")

    lines = widget.source_code.splitlines()
    if start_line < 1 or end_line < start_line or end_line > len(lines):
        raise CustomWidgetError(
            f"line range {start_line}-{end_line} is out of bounds for a "
            f"{len(lines)}-line source — call get_custom_widget_source to see current line numbers"
        )

    replacement = new_code.splitlines()
    new_lines = lines[: start_line - 1] + replacement + lines[end_line:]
    return _save_edited_source(conn, widget, "\n".join(new_lines))


def edit_by_string(
    conn: sqlite3.Connection, key: str, old_string: str, new_string: str
) -> CustomWidgetOut:
    """Replace a single unique occurrence of old_string with new_string."""
    widget = get_by_key(conn, key)
    if widget is None:
        raise CustomWidgetError(f"no custom widget with key {key!r}")

    count = widget.source_code.count(old_string)
    if count == 0:
        raise CustomWidgetError("old_string not found in source — check it matches exactly, including whitespace")
    if count > 1:
        raise CustomWidgetError(
            f"old_string is not unique — found {count} occurrences, "
            "include more surrounding context so it matches exactly once"
        )

    new_source = widget.source_code.replace(old_string, new_string, 1)
    return _save_edited_source(conn, widget, new_source)
