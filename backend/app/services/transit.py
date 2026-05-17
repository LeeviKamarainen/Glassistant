"""Transit service: thin GraphQL proxy over HSL Digitransit with a short TTL cache."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

DIGITRANSIT_URL = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1"


_LEGS_FIELDS = """
        legs {
          mode
          duration
          start { scheduledTime }
          end { scheduledTime }
          from { name }
          to { name }
          route { shortName }
          headsign
        }"""

_PLAN_RESULT_FIELDS = """
    edges {
      node {
        start
        end
        duration
        %s
      }
    }""" % _LEGS_FIELDS.strip()


@dataclass
class TransitLeg:
    mode: str
    from_name: str
    to_name: str
    start_time: str
    end_time: str
    route_short_name: str | None
    headsign: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "from_name": self.from_name,
            "to_name": self.to_name,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "route_short_name": self.route_short_name,
            "headsign": self.headsign,
        }


@dataclass
class TransitItinerary:
    duration_seconds: int
    departure: str
    arrival: str
    legs: list[TransitLeg] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "duration_seconds": self.duration_seconds,
            "departure": self.departure,
            "arrival": self.arrival,
            "legs": [lg.to_dict() for lg in self.legs],
        }


def _cache_key(
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    modes: tuple[str, ...],
) -> tuple:
    bucket = int(time.time() / 90)
    return (round(from_lat, 3), round(from_lon, 3), round(to_lat, 3), round(to_lon, 3), modes, bucket)


class TransitService:
    def __init__(self, api_key: str, client: httpx.AsyncClient | None = None) -> None:
        self._api_key = api_key
        self._cache: dict[tuple, list[TransitItinerary]] = {}
        self._client = client or httpx.AsyncClient(timeout=10.0)
        self._owns_client = client is None

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def plan(
        self,
        from_lat: float,
        from_lon: float,
        to_lat: float,
        to_lon: float,
        num: int = 3,
        modes: list[str] | None = None,
    ) -> list[TransitItinerary]:
        modes_key = tuple(sorted(modes)) if modes else ()
        key = _cache_key(from_lat, from_lon, to_lat, to_lon, modes_key)
        if key in self._cache:
            return self._cache[key]
        result = await self._fetch(from_lat, from_lon, to_lat, to_lon, num, modes)
        self._cache[key] = result
        return result

    def _build_query(self, modes: list[str] | None) -> str:
        if modes:
            # Inline the enum values directly — avoids GraphQL variable type-name issues.
            mode_list = ", ".join(f"{{mode: {m}}}" for m in modes)
            modes_arg = f"modes: {{ transit: {{ transit: [{mode_list}] }} }}"
        else:
            modes_arg = ""
        return (
            "query PlanRoute(\n"
            "  $fromLat: CoordinateValue!\n"
            "  $fromLon: CoordinateValue!\n"
            "  $toLat: CoordinateValue!\n"
            "  $toLon: CoordinateValue!\n"
            "  $num: Int!\n"
            "  $dateTime: OffsetDateTime!\n"
            ") {\n"
            "  planConnection(\n"
            "    origin: { location: { coordinate: { latitude: $fromLat, longitude: $fromLon } } }\n"
            "    destination: { location: { coordinate: { latitude: $toLat, longitude: $toLon } } }\n"
            "    first: $num\n"
            "    dateTime: { earliestDeparture: $dateTime }\n"
            + (f"    {modes_arg}\n" if modes_arg else "")
            + "  ) {\n"
            + _PLAN_RESULT_FIELDS
            + "\n  }\n}"
        )

    async def _fetch(
        self,
        from_lat: float,
        from_lon: float,
        to_lat: float,
        to_lon: float,
        num: int,
        modes: list[str] | None,
    ) -> list[TransitItinerary]:
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        variables: dict[str, Any] = {
            "fromLat": from_lat,
            "fromLon": from_lon,
            "toLat": to_lat,
            "toLon": to_lon,
            "num": num,
            "dateTime": now,
        }
        query = self._build_query(modes)

        resp = await self._client.post(
            DIGITRANSIT_URL,
            json={"query": query, "variables": variables},
            headers={
                "Content-Type": "application/json",
                "digitransit-subscription-key": self._api_key,
            },
        )
        resp.raise_for_status()
        body = resp.json()

        if errors := body.get("errors"):
            messages = "; ".join(e.get("message", str(e)) for e in errors)
            raise RuntimeError(f"Digitransit GraphQL error: {messages}")

        edges = (
            ((body.get("data") or {}).get("planConnection") or {}).get("edges") or []
        )
        itineraries: list[TransitItinerary] = []
        for edge in edges:
            node = edge.get("node") or {}
            legs_raw = node.get("legs") or []
            legs = [
                TransitLeg(
                    mode=lg.get("mode", ""),
                    from_name=(lg.get("from") or {}).get("name", ""),
                    to_name=(lg.get("to") or {}).get("name", ""),
                    start_time=(lg.get("start") or {}).get("scheduledTime", ""),
                    end_time=(lg.get("end") or {}).get("scheduledTime", ""),
                    route_short_name=(lg.get("route") or {}).get("shortName"),
                    headsign=lg.get("headsign"),
                )
                for lg in legs_raw
            ]
            if not legs:
                continue
            itineraries.append(
                TransitItinerary(
                    duration_seconds=int(node.get("duration") or 0),
                    departure=node.get("start") or legs[0].start_time,
                    arrival=node.get("end") or legs[-1].end_time,
                    legs=legs,
                )
            )
        return itineraries
