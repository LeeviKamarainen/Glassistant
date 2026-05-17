from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import Settings, get_settings
from app.db import _open, run_migrations
from app.events import Broadcaster
from app.repositories import widgets as widgets_repo
from app.routers import events as events_router
from app.routers import layout as layout_router
from app.routers import settings as settings_router
from app.routers import system as system_router
from app.routers import transit as transit_router
from app.routers import weather as weather_router
from app.services.transit import TransitService
from app.services.weather import WeatherService

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    run_migrations(settings.db_path)
    conn = _open(settings.db_path)
    try:
        widgets_repo.seed_defaults_if_empty(conn)
    finally:
        conn.close()

    app.state.broadcaster = Broadcaster()
    app.state.weather = WeatherService(ttl_seconds=settings.weather_cache_ttl_seconds)
    app.state.transit = (
        TransitService(api_key=settings.digitransit_api_key)
        if settings.digitransit_api_key
        else None
    )
    try:
        yield
    finally:
        await app.state.weather.aclose()
        if app.state.transit is not None:
            await app.state.transit.aclose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Glassistant", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(layout_router.router)
    app.include_router(events_router.router)
    app.include_router(weather_router.router)
    app.include_router(settings_router.router)
    app.include_router(transit_router.router)
    app.include_router(system_router.router)

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    # Serve the built frontend if it exists. In dev you'll use Vite on :5173 instead.
    if FRONTEND_DIST.is_dir():
        assets_dir = FRONTEND_DIST / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa_fallback(full_path: str) -> FileResponse:
            # Anything not handled by /api or /assets falls back to index.html so
            # client-side routes like /mirror and /admin work on hard refresh.
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()
