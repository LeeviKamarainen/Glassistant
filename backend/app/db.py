from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _open(db_path: Path) -> sqlite3.Connection:
    # check_same_thread=False is safe here because each request opens its own
    # connection and never shares it; the sync dep can be set up in a worker
    # thread while the async endpoint that uses it runs on the event loop thread.
    conn = sqlite3.connect(
        db_path, isolation_level=None, check_same_thread=False
    )  # autocommit; we manage tx explicitly
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def connection(db_path: Path) -> Iterator[sqlite3.Connection]:
    conn = _open(db_path)
    try:
        yield conn
    finally:
        conn.close()


def run_migrations(db_path: Path) -> list[str]:
    """Apply any pending SQL files from migrations/ in lexical order.

    Returns the list of newly applied migration names.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)
    applied: list[str] = []
    with connection(db_path) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "  name TEXT PRIMARY KEY,"
            "  applied_at TEXT NOT NULL DEFAULT (datetime('now'))"
            ")"
        )
        done = {r["name"] for r in conn.execute("SELECT name FROM schema_migrations")}
        for sql_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if sql_file.name in done:
                continue
            conn.executescript("BEGIN;\n" + sql_file.read_text(encoding="utf-8") + "\nCOMMIT;")
            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations(name) VALUES (?)", (sql_file.name,)
            )
            applied.append(sql_file.name)
    return applied
