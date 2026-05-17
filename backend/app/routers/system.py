from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/system")
def get_system_config(request: Request) -> dict:
    """Exposes non-sensitive env-derived config the frontend needs at runtime."""
    from app.config import Settings

    settings: Settings = request.app.state.settings
    return {
        "home_lat": settings.home_lat,
        "home_lon": settings.home_lon,
    }
