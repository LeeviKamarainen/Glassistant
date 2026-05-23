from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.services.flights import FlightsService

router = APIRouter(prefix="/api", tags=["flights"])


@router.get("/flights")
async def get_flights(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=50.0, ge=1.0, le=500.0),
) -> dict:
    """Return airborne aircraft within *radius_km* of (lat, lon).

    Results are cached for ``flights_cache_ttl_seconds`` (default 15 s) so that
    rapid widget refreshes don't burn the OpenSky anonymous quota (≈400 req/day).
    """
    service: FlightsService = request.app.state.flights
    try:
        snapshot = await service.get(lat, lon, radius_km)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenSky upstream failed: {exc}",
        )
    return snapshot.to_dict()
