from __future__ import annotations

import sqlite3
from datetime import datetime

from app.schemas.todo import TodoCreate, TodoOut, TodoUpdate


def _row_to_todo(row: sqlite3.Row) -> TodoOut:
    return TodoOut(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        due_date=row["due_date"],
        icon=row["icon"],
        done=bool(row["done"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def list_todos(conn: sqlite3.Connection) -> list[TodoOut]:
    rows = conn.execute(
        "SELECT * FROM todos ORDER BY due_date ASC NULLS LAST, id ASC"
    ).fetchall()
    return [_row_to_todo(r) for r in rows]


def get_todo(conn: sqlite3.Connection, todo_id: int) -> TodoOut | None:
    row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    return _row_to_todo(row) if row else None


def create_todo(conn: sqlite3.Connection, data: TodoCreate) -> TodoOut:
    cur = conn.execute(
        "INSERT INTO todos (name, description, due_date, icon) VALUES (?, ?, ?, ?)",
        (data.name, data.description, data.due_date, data.icon),
    )
    new_id = cur.lastrowid
    assert new_id is not None
    result = get_todo(conn, new_id)
    assert result is not None
    return result


def update_todo(conn: sqlite3.Connection, todo_id: int, patch: TodoUpdate) -> TodoOut | None:
    existing = get_todo(conn, todo_id)
    if existing is None:
        return None

    fields = patch.model_dump(exclude_unset=True)
    if not fields:
        return existing

    # Normalize done to int for SQLite; other types pass through as-is
    normalized = {k: (1 if v else 0) if k == "done" else v for k, v in fields.items()}
    set_clauses = ", ".join(f"{k} = ?" for k in normalized)

    conn.execute(
        f"UPDATE todos SET {set_clauses}, updated_at = datetime('now') WHERE id = ?",  # noqa: S608
        (*normalized.values(), todo_id),
    )
    return get_todo(conn, todo_id)


def delete_todo(conn: sqlite3.Connection, todo_id: int) -> bool:
    cur = conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    return cur.rowcount > 0
