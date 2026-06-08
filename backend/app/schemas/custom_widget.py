from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

_MAX_SOURCE_LEN = 8192


class CustomWidgetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)
    source_code: str = Field(..., min_length=1, max_length=_MAX_SOURCE_LEN)


class CustomWidgetOut(BaseModel):
    id: int
    key: str
    name: str
    description: str
    source_code: str
    status: str
    created_at: datetime
    updated_at: datetime
