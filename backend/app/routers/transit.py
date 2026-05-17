from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.services.transit import TransitService

router = APIRouter(prefix="/api", tags=["transit"])


class Coord(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class PlanRequest(BaseModel):
    origin: Coord
    destination: Coord
    num: int = Field(default=3, ge=1, le=5)
    modes: list[str] | None = None


@router.post("/transit/plan")
async def plan_transit(body: PlanRequest, request: Request) -> dict:
    service: TransitService | None = getattr(request.app.state, "transit", None)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Transit service not configured (GLASSISTANT_DIGITRANSIT_API_KEY not set)",
        )
    try:
        itineraries = await service.plan(
            body.origin.lat,
            body.origin.lon,
            body.destination.lat,
            body.destination.lon,
            body.num,
            body.modes,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"transit upstream failed: {e}",
        )
    return {"itineraries": [i.to_dict() for i in itineraries]}
