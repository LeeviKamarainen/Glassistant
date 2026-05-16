"""Widget CRUD against SQLite. Hand-written SQL, no ORM.

Position validation (in-bounds, no overlap with other enabled widgets) lives here
so it can't be bypassed by a router skipping a check.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from app.schemas.widget import GRID_SIZE, WidgetCreate, WidgetOut, WidgetUpdate


class WidgetError(Exception):
    """Domain error raised for invalid widget operations (overlap, not found, etc.)."""


def _row_to_widget(row: sqlite3.Row) -> WidgetOut:
    return WidgetOut(
        id=row["id"],
        type=row["type"],
        row=row["row"],
        col=row["col"],
        row_span=row["row_span"],
        col_span=row["col_span"],
        config=json.loads(row["config_json"]) if row["config_json"] else {},
        enabled=bool(row["enabled"]),
        z_order=row["z_order"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _cells(row: int, col: int, row_span: int, col_span: int) -> set[tuple[int, int]]:
    return {(r, c) for r in range(row, row + row_span) for c in range(col, col + col_span)}


def _check_bounds(row: int, col: int, row_span: int, col_span: int) -> None:
    if not (0 <= row < GRID_SIZE and 0 <= col < GRID_SIZE):
        raise WidgetError("position out of bounds")
    if row + row_span > GRID_SIZE or col + col_span > GRID_SIZE:
        raise WidgetError("widget exceeds grid bounds")
    if row_span < 1 or col_span < 1:
        raise WidgetError("spans must be >= 1")


def _check_no_overlap(
    conn: sqlite3.Connection,
    row: int,
    col: int,
    row_span: int,
    col_span: int,
    exclude_id: int | None,
) -> None:
    target = _cells(row, col, row_span, col_span)
    sql = "SELECT id, row, col, row_span, col_span FROM widgets WHERE enabled = 1"
    params: tuple[Any, ...] = ()
    if exclude_id is not None:
        sql += " AND id <> ?"
        params = (exclude_id,)
    for r in conn.execute(sql, params):
        if _cells(r["row"], r["col"], r["row_span"], r["col_span"]) & target:
            raise WidgetError(f"position overlaps with widget id={r['id']}")


def list_widgets(conn: sqlite3.Connection) -> list[WidgetOut]:
    rows = conn.execute(
        "SELECT * FROM widgets ORDER BY z_order ASC, id ASC"
    ).fetchall()
    return [_row_to_widget(r) for r in rows]


def get_widget(conn: sqlite3.Connection, widget_id: int) -> WidgetOut | None:
    row = conn.execute("SELECT * FROM widgets WHERE id = ?", (widget_id,)).fetchone()
    return _row_to_widget(row) if row else None


def create_widget(conn: sqlite3.Connection, data: WidgetCreate) -> WidgetOut:
    _check_bounds(data.row, data.col, data.row_span, data.col_span)
    if data.enabled:
        _check_no_overlap(conn, data.row, data.col, data.row_span, data.col_span, exclude_id=None)
    cur = conn.execute(
        """
        INSERT INTO widgets (type, row, col, row_span, col_span, config_json, enabled, z_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.type,
            data.row,
            data.col,
            data.row_span,
            data.col_span,
            json.dumps(data.config),
            1 if data.enabled else 0,
            data.z_order,
        ),
    )
    new_id = cur.lastrowid
    assert new_id is not None
    result = get_widget(conn, new_id)
    assert result is not None
    return result


def update_widget(
    conn: sqlite3.Connection, widget_id: int, patch: WidgetUpdate
) -> WidgetOut:
    existing = get_widget(conn, widget_id)
    if existing is None:
        raise WidgetError("widget not found")

    merged = existing.model_copy(
        update={k: v for k, v in patch.model_dump(exclude_unset=True).items()}
    )
    _check_bounds(merged.row, merged.col, merged.row_span, merged.col_span)
    if merged.enabled:
        _check_no_overlap(
            conn,
            merged.row,
            merged.col,
            merged.row_span,
            merged.col_span,
            exclude_id=widget_id,
        )

    conn.execute(
        """
        UPDATE widgets
           SET type = ?, row = ?, col = ?, row_span = ?, col_span = ?,
               config_json = ?, enabled = ?, z_order = ?,
               updated_at = datetime('now')
         WHERE id = ?
        """,
        (
            merged.type,
            merged.row,
            merged.col,
            merged.row_span,
            merged.col_span,
            json.dumps(merged.config),
            1 if merged.enabled else 0,
            merged.z_order,
            widget_id,
        ),
    )
    result = get_widget(conn, widget_id)
    assert result is not None
    return result


def delete_widget(conn: sqlite3.Connection, widget_id: int) -> bool:
    cur = conn.execute("DELETE FROM widgets WHERE id = ?", (widget_id,))
    return cur.rowcount > 0


DEFAULT_LAYOUT: list[WidgetCreate] = [
    WidgetCreate(type="clock", row=0, col=1, row_span=1, col_span=1),
    WidgetCreate(type="date", row=0, col=2, row_span=1, col_span=1),
    WidgetCreate(type="weather", row=1, col=0, row_span=1, col_span=1),
]


def reset_to_defaults(conn: sqlite3.Connection) -> list[WidgetOut]:
    conn.execute("DELETE FROM widgets")
    return [create_widget(conn, w) for w in DEFAULT_LAYOUT]


def seed_defaults_if_empty(conn: sqlite3.Connection) -> bool:
    """Insert default widgets only when the table has none. Returns True if seeded."""
    (count,) = conn.execute("SELECT COUNT(*) FROM widgets").fetchone()
    if count > 0:
        return False
    for w in DEFAULT_LAYOUT:
        create_widget(conn, w)
    return True
