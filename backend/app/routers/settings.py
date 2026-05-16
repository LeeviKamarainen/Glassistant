from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_broadcaster, get_db
from app.events import Broadcaster
from app.repositories import settings as settings_repo
from app.schemas.settings import (
    KNOWN_EFFECT_STYLES,
    KNOWN_THEMES,
    SettingsOut,
    SettingUpdate,
)

router = APIRouter(prefix="/api", tags=["settings"])

# Settings that must be one of a fixed set of strings.
_ENUM_VALUES: dict[str, set[str]] = {
    "theme": KNOWN_THEMES,
    "weather_effect_style": KNOWN_EFFECT_STYLES,
}

# Settings that must be integers within [lo, hi].
_INT_RANGE: dict[str, tuple[int, int]] = {
    "grid_rows": (1, 50),
    "grid_cols": (1, 50),
}


async def _publish_settings_changed(
    broadcaster: Broadcaster, conn: sqlite3.Connection
) -> None:
    await broadcaster.publish(
        "settings_changed",
        {"settings": settings_repo.get_all(conn)},
    )


@router.get("/settings", response_model=SettingsOut)
def get_settings(conn: sqlite3.Connection = Depends(get_db)) -> SettingsOut:
    return SettingsOut(settings=settings_repo.get_all(conn))


@router.put("/settings/{key}", response_model=SettingsOut)
async def put_setting(
    key: str,
    body: SettingUpdate,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> SettingsOut:
    allowed = _ENUM_VALUES.get(key)
    if allowed is not None and body.value not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"invalid value for {key}; expected one of {sorted(allowed)}",
        )
    int_range = _INT_RANGE.get(key)
    if int_range is not None:
        try:
            v = int(body.value)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{key} must be an integer",
            )
        lo, hi = int_range
        if not (lo <= v <= hi):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{key} must be between {lo} and {hi}",
            )
    settings_repo.set_value(conn, key, body.value)
    await _publish_settings_changed(broadcaster, conn)
    return SettingsOut(settings=settings_repo.get_all(conn))
