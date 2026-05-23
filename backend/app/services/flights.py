"""Flights service: thin proxy over OpenSky Network with in-memory TTL cache.

OpenSky is free and keyless for anonymous use (~400 req/day, refreshed at midnight UTC).
We query by bounding box derived from home coordinates + radius.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

import httpx

OPENSKY_URL = "https://opensky-network.org/api/states/all"

# Field indices in the OpenSky states vector
_ICAO24 = 0
_CALLSIGN = 1
_ORIGIN_COUNTRY = 2
_LONGITUDE = 5
_LATITUDE = 6
_BARO_ALTITUDE = 7
_ON_GROUND = 8
_VELOCITY = 9
_TRUE_TRACK = 10
_VERTICAL_RATE = 11


@dataclass
class Aircraft:
    icao24: str
    callsign: str | None
    origin_country: str
    longitude: float | None
    latitude: float | None
    altitude_m: float | None
    on_ground: bool
    velocity_ms: float | None
    heading_deg: float | None
    vertical_rate_ms: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "icao24": self.icao24,
            "callsign": self.callsign,
            "origin_country": self.origin_country,
            "longitude": self.longitude,
            "latitude": self.latitude,
            "altitude_m": self.altitude_m,
            "on_ground": self.on_ground,
            "velocity_ms": self.velocity_ms,
            "heading_deg": self.heading_deg,
            "vertical_rate_ms": self.vertical_rate_ms,
        }


@dataclass
class FlightsSnapshot:
    aircraft: list[Aircraft]
    fetched_at: float
    lat: float
    lon: float
    radius_km: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "aircraft": [a.to_dict() for a in self.aircraft],
            "fetched_at": self.fetched_at,
            "lat": self.lat,
            "lon": self.lon,
            "radius_km": self.radius_km,
        }


def _bounding_box(
    lat: float, lon: float, radius_km: float
) -> tuple[float, float, float, float]:
    """Return (lamin, lomin, lamax, lomax) for a square bounding the circle."""
    delta_lat = radius_km / 111.0
    delta_lon = radius_km / (111.0 * math.cos(math.radians(lat)))
    return (lat - delta_lat, lon - delta_lon, lat + delta_lat, lon + delta_lon)


def _cache_key(lat: float, lon: float, radius_km: float) -> tuple[float, float, float]:
    return (round(lat, 3), round(lon, 3), float(radius_km))


def _parse_state(state: list) -> Aircraft:
    def _g(idx: int) -> Any:
        return state[idx] if idx < len(state) else None

    callsign: str | None = _g(_CALLSIGN)
    if callsign is not None:
        callsign = callsign.strip() or None

    return Aircraft(
        icao24=str(_g(_ICAO24) or ""),
        callsign=callsign,
        origin_country=str(_g(_ORIGIN_COUNTRY) or ""),
        longitude=_g(_LONGITUDE),
        latitude=_g(_LATITUDE),
        altitude_m=_g(_BARO_ALTITUDE),
        on_ground=bool(_g(_ON_GROUND)),
        velocity_ms=_g(_VELOCITY),
        heading_deg=_g(_TRUE_TRACK),
        vertical_rate_ms=_g(_VERTICAL_RATE),
    )


class FlightsService:
    def __init__(
        self,
        ttl_seconds: int,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._ttl = ttl_seconds
        self._cache: dict[tuple[float, float, float], FlightsSnapshot] = {}
        self._client = client or httpx.AsyncClient(timeout=15.0)
        self._owns_client = client is None

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def get(
        self, lat: float, lon: float, radius_km: float
    ) -> FlightsSnapshot:
        key = _cache_key(lat, lon, radius_km)
        now = time.time()
        cached = self._cache.get(key)
        if cached is not None and (now - cached.fetched_at) < self._ttl:
            return cached
        snapshot = await self._fetch(lat, lon, radius_km)
        self._cache[key] = snapshot
        return snapshot

    async def _fetch(
        self, lat: float, lon: float, radius_km: float
    ) -> FlightsSnapshot:
        lamin, lomin, lamax, lomax = _bounding_box(lat, lon, radius_km)
        resp = await self._client.get(
            OPENSKY_URL,
            params={
                "lamin": lamin,
                "lomin": lomin,
                "lamax": lamax,
                "lomax": lomax,
            },
        )
        resp.raise_for_status()
        body = resp.json()
        states: list = body.get("states") or []
        aircraft = [_parse_state(s) for s in states if s]
        # Drop ground vehicles; keep airborne aircraft only
        aircraft = [a for a in aircraft if not a.on_ground]
        return FlightsSnapshot(
            aircraft=aircraft,
            fetched_at=time.time(),
            lat=lat,
            lon=lon,
            radius_km=radius_km,
        )
