"""Saved-layout CRUD against SQLite.

A saved layout is a named snapshot of the current widget set stored as JSON.
Widget IDs are not persisted — each load creates fresh rows in the ``widgets``
table so there are no stale-ID problems.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from app.repositories import widgets as widgets_repo
from app.schemas.saved_layout import SavedLayoutOut
from app.schemas.widget import WidgetCreate, WidgetOut


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_out(row: sqlite3.Row) -> SavedLayoutOut:
    snapshot: list[dict] = json.loads(row["snapshot_json"])
    return SavedLayoutOut(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        widget_count=len(snapshot),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _widgets_to_snapshot(widgets: list[WidgetOut]) -> str:
    """Serialise widgets to a JSON snapshot (no IDs, no timestamps)."""
    return json.dumps(
        [
            {
                "type": w.type,
                "row": w.row,
                "col": w.col,
                "row_span": w.row_span,
                "col_span": w.col_span,
                "config": w.config,
                "enabled": w.enabled,
                "z_order": w.z_order,
            }
            for w in widgets
        ]
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def list_saved_layouts(conn: sqlite3.Connection) -> list[SavedLayoutOut]:
    rows = conn.execute(
        "SELECT * FROM saved_layouts ORDER BY updated_at DESC"
    ).fetchall()
    return [_row_to_out(r) for r in rows]


def get_saved_layout(conn: sqlite3.Connection, layout_id: int) -> SavedLayoutOut | None:
    row = conn.execute(
        "SELECT * FROM saved_layouts WHERE id = ?", (layout_id,)
    ).fetchone()
    return _row_to_out(row) if row else None


def create_saved_layout(
    conn: sqlite3.Connection, name: str, description: str
) -> SavedLayoutOut:
    """Snapshot the current widget set and store it under *name*.

    Raises ``sqlite3.IntegrityError`` if the name is already taken.
    """
    widgets = widgets_repo.list_widgets(conn)
    snapshot = _widgets_to_snapshot(widgets)
    cur = conn.execute(
        "INSERT INTO saved_layouts (name, description, snapshot_json) VALUES (?, ?, ?)",
        (name, description, snapshot),
    )
    row = conn.execute(
        "SELECT * FROM saved_layouts WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    assert row is not None
    return _row_to_out(row)


def delete_saved_layout(conn: sqlite3.Connection, layout_id: int) -> bool:
    cur = conn.execute("DELETE FROM saved_layouts WHERE id = ?", (layout_id,))
    return cur.rowcount > 0


def load_saved_layout(
    conn: sqlite3.Connection,
    layout_id: int,
    known_types: list[str] | None,
) -> tuple[list[WidgetOut], list[str]]:
    """Replace the current widget set with the saved snapshot.

    Args:
        conn: Open DB connection.
        layout_id: Row ID in ``saved_layouts``.
        known_types: If provided, any widget whose *type* is not in this
            list is skipped (not inserted) and its type key is collected in
            the returned ``skipped_types`` list.  Pass ``None`` to load
            everything without filtering.

    Returns:
        ``(loaded_widgets, skipped_types)`` — the widgets that were actually
        inserted and the type keys that were omitted.

    Raises:
        ``KeyError`` if ``layout_id`` does not exist.
    """
    row = conn.execute(
        "SELECT snapshot_json FROM saved_layouts WHERE id = ?", (layout_id,)
    ).fetchone()
    if row is None:
        raise KeyError(f"saved layout id={layout_id} not found")

    snapshot: list[dict] = json.loads(row["snapshot_json"])

    known_set = set(known_types) if known_types is not None else None

    # Clear the current layout.
    conn.execute("DELETE FROM widgets")

    loaded: list[WidgetOut] = []
    skipped_types: list[str] = []

    for entry in snapshot:
        widget_type: str = entry.get("type", "")

        # Skip types the frontend doesn't know about.
        if known_set is not None and widget_type not in known_set:
            if widget_type not in skipped_types:
                skipped_types.append(widget_type)
            continue

        try:
            widget = widgets_repo.create_widget(
                conn,
                WidgetCreate(
                    type=widget_type,
                    row=entry["row"],
                    col=entry["col"],
                    row_span=entry.get("row_span", 1),
                    col_span=entry.get("col_span", 1),
                    config=entry.get("config", {}),
                    enabled=entry.get("enabled", True),
                    z_order=entry.get("z_order", 0),
                ),
            )
            loaded.append(widget)
        except widgets_repo.WidgetError:
            # Overlap or out-of-bounds — skip and record the type.
            if widget_type not in skipped_types:
                skipped_types.append(widget_type)

    return loaded, skipped_types
