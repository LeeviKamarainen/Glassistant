"""Shared FastAPI dependencies."""
from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from fastapi import Depends, Request

from app.config import Settings
from app.db import _open
from app.events import Broadcaster


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings  # type: ignore[no-any-return]


def get_broadcaster(request: Request) -> Broadcaster:
    return request.app.state.broadcaster  # type: ignore[no-any-return]


def get_db(settings: Settings = Depends(get_settings_dep)) -> Iterator[sqlite3.Connection]:
    conn = _open(settings.db_path)
    try:
        yield conn
    finally:
        conn.close()
