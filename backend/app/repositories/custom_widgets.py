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
