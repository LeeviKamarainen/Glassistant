from __future__ import annotations

from pydantic import BaseModel


class CalendarEvent(BaseModel):
    id: str
    summary: str
    start: str
    end: str
    all_day: bool
    color: str | None = None


class CalendarWeekResponse(BaseModel):
    events: list[CalendarEvent]
    authorized: bool
