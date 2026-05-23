from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.widget import WidgetOut


class SavedLayoutCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    description: str = Field(default="", max_length=256)


class SavedLayoutOut(BaseModel):
    id: int
    name: str
    description: str
    widget_count: int
    created_at: datetime
    updated_at: datetime


class SavedLayoutsOut(BaseModel):
    layouts: list[SavedLayoutOut]


class LoadLayoutRequest(BaseModel):
    """Optional list of widget type keys the frontend knows about.

    Any widget in the snapshot whose type is NOT in this list will be silently
    skipped and its type key reported in ``skipped_types``. Pass ``null`` / omit
    to load all types without filtering.
    """

    known_types: list[str] | None = None


class LoadLayoutResult(BaseModel):
    widgets: list[WidgetOut]
    skipped_types: list[str]
