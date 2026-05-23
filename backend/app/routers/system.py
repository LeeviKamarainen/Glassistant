from __future__ import annotations

from fastapi import APIRouter, Request

from app.agent.widget_registry import WIDGET_REGISTRY

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


@router.get("/widget-types")
def get_widget_types() -> dict:
    """Return all registered widget types with their metadata.

    The list is sourced from the backend widget registry, which is the same
    source the agent uses — so this endpoint always reflects the current set
    of supported widgets without any manual maintenance.
    """
    return {
        "types": [
            {
                "key": key,
                "label": meta.label,
                "description": meta.description,
                "default_row_span": meta.default_row_span,
                "default_col_span": meta.default_col_span,
            }
            for key, meta in WIDGET_REGISTRY.items()
        ]
    }
