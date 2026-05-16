from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

# Upper bound only; real bounds validation lives in the repository layer
# where it can read the configured grid dimensions from app_settings.
_MAX_GRID = 100


class WidgetCreate(BaseModel):
    type: str = Field(..., min_length=1, max_length=64)
    row: int = Field(..., ge=0, lt=_MAX_GRID)
    col: int = Field(..., ge=0, lt=_MAX_GRID)
    row_span: int = Field(default=1, ge=1, le=_MAX_GRID)
    col_span: int = Field(default=1, ge=1, le=_MAX_GRID)
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    z_order: int = 0


class WidgetUpdate(BaseModel):
    type: str | None = Field(default=None, min_length=1, max_length=64)
    row: int | None = Field(default=None, ge=0, lt=_MAX_GRID)
    col: int | None = Field(default=None, ge=0, lt=_MAX_GRID)
    row_span: int | None = Field(default=None, ge=1, le=_MAX_GRID)
    col_span: int | None = Field(default=None, ge=1, le=_MAX_GRID)
    config: dict[str, Any] | None = None
    enabled: bool | None = None
    z_order: int | None = None


class WidgetOut(BaseModel):
    id: int
    type: str
    row: int
    col: int
    row_span: int
    col_span: int
    config: dict[str, Any]
    enabled: bool
    z_order: int
    created_at: datetime
    updated_at: datetime


class LayoutOut(BaseModel):
    widgets: list[WidgetOut]
