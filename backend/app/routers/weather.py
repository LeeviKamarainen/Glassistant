from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.services.weather import WeatherService

router = APIRouter(prefix="/api", tags=["weather"])


@router.get("/weather")
async def get_weather(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict:
    service: WeatherService = request.app.state.weather
    try:
        snapshot = await service.get(lat, lon)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"weather upstream failed: {e}",
        )
    return snapshot.to_dict()
