"""Weather service: thin proxy over Open-Meteo with a small in-memory TTL cache.

Open-Meteo is free and keyless. We round lat/lon to two decimals when caching so
widgets pointing at the same approximate location share the cached payload.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


@dataclass
class ForecastDay:
    date: str
    weather_code: int | None
    temp_max_c: float | None
    temp_min_c: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "date": self.date,
            "weather_code": self.weather_code,
            "temp_max_c": self.temp_max_c,
            "temp_min_c": self.temp_min_c,
        }


@dataclass
class WeatherSnapshot:
    lat: float
    lon: float
    temperature_c: float | None
    weather_code: int | None
    wind_speed_kmh: float | None
    humidity_pct: float | None
    fetched_at: float  # unix seconds
    forecast: list[ForecastDay] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "lat": self.lat,
            "lon": self.lon,
            "temperature_c": self.temperature_c,
            "weather_code": self.weather_code,
            "wind_speed_kmh": self.wind_speed_kmh,
            "humidity_pct": self.humidity_pct,
            "fetched_at": self.fetched_at,
            "forecast": [d.to_dict() for d in self.forecast],
        }


def _cache_key(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat, 2), round(lon, 2))


class WeatherService:
    def __init__(
        self,
        ttl_seconds: int,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._ttl = ttl_seconds
        self._cache: dict[tuple[float, float], WeatherSnapshot] = {}
        self._client = client or httpx.AsyncClient(timeout=10.0)
        self._owns_client = client is None

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def get(self, lat: float, lon: float) -> WeatherSnapshot:
        key = _cache_key(lat, lon)
        now = time.time()
        cached = self._cache.get(key)
        if cached is not None and (now - cached.fetched_at) < self._ttl:
            return cached
        snapshot = await self._fetch(lat, lon)
        self._cache[key] = snapshot
        return snapshot

    async def _fetch(self, lat: float, lon: float) -> WeatherSnapshot:
        resp = await self._client.get(
            OPEN_METEO_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": ",".join(
                    [
                        "temperature_2m",
                        "weather_code",
                        "wind_speed_10m",
                        "relative_humidity_2m",
                    ]
                ),
                "daily": ",".join(
                    [
                        "weather_code",
                        "temperature_2m_max",
                        "temperature_2m_min",
                    ]
                ),
                "timezone": "auto",
                "wind_speed_unit": "kmh",
            },
        )
        resp.raise_for_status()
        body = resp.json()
        current = body.get("current", {}) or {}

        daily_raw = body.get("daily", {}) or {}
        times: list[str] = daily_raw.get("time", []) or []
        codes: list[int | None] = daily_raw.get("weather_code", []) or []
        maxes: list[float | None] = daily_raw.get("temperature_2m_max", []) or []
        mins: list[float | None] = daily_raw.get("temperature_2m_min", []) or []
        forecast = [
            ForecastDay(
                date=date,
                weather_code=codes[i] if i < len(codes) else None,
                temp_max_c=maxes[i] if i < len(maxes) else None,
                temp_min_c=mins[i] if i < len(mins) else None,
            )
            for i, date in enumerate(times)
        ]

        return WeatherSnapshot(
            lat=lat,
            lon=lon,
            temperature_c=current.get("temperature_2m"),
            weather_code=current.get("weather_code"),
            wind_speed_kmh=current.get("wind_speed_10m"),
            humidity_pct=current.get("relative_humidity_2m"),
            fetched_at=time.time(),
            forecast=forecast,
        )
