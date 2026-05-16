from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from app.services.weather import WeatherService


def _make_transport(call_counter: dict[str, int]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        call_counter["n"] = call_counter.get("n", 0) + 1
        return httpx.Response(
            200,
            json={
                "current": {
                    "temperature_2m": 20.5 + call_counter["n"],
                    "weather_code": 0,
                    "wind_speed_10m": 4.2,
                    "relative_humidity_2m": 55,
                }
            },
        )

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_cache_hit_within_ttl() -> None:
    counter: dict[str, int] = {}
    client = httpx.AsyncClient(transport=_make_transport(counter))
    service = WeatherService(ttl_seconds=600, client=client)
    try:
        first = await service.get(60.17, 24.94)
        second = await service.get(60.17, 24.94)
        assert counter["n"] == 1, "second call should hit the cache"
        assert first.temperature_c == second.temperature_c
    finally:
        await service.aclose()
        await client.aclose()


@pytest.mark.asyncio
async def test_cache_expires_after_ttl() -> None:
    counter: dict[str, int] = {}
    client = httpx.AsyncClient(transport=_make_transport(counter))
    service = WeatherService(ttl_seconds=0, client=client)  # immediate expiry
    try:
        await service.get(60.17, 24.94)
        # Sleep a hair so the next call is strictly after fetched_at.
        await asyncio.sleep(0.01)
        await service.get(60.17, 24.94)
        assert counter["n"] == 2
    finally:
        await service.aclose()
        await client.aclose()


@pytest.mark.asyncio
async def test_cache_key_rounds_to_two_decimals() -> None:
    counter: dict[str, int] = {}
    client = httpx.AsyncClient(transport=_make_transport(counter))
    service = WeatherService(ttl_seconds=600, client=client)
    try:
        await service.get(60.169912, 24.938401)
        await service.get(60.168999, 24.937222)  # rounds to same (60.17, 24.94)
        assert counter["n"] == 1
    finally:
        await service.aclose()
        await client.aclose()
