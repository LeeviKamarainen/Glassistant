from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

GRID_SIZE = 3  # 3x3 grid for iteration 1


class WidgetCreate(BaseModel):
    type: str = Field(..., min_length=1, max_length=64)
    row: int = Field(..., ge=0, le=GRID_SIZE - 1)
    col: int = Field(..., ge=0, le=GRID_SIZE - 1)
    row_span: int = Field(default=1, ge=1, le=GRID_SIZE)
    col_span: int = Field(default=1, ge=1, le=GRID_SIZE)
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    z_order: int = 0

    @field_validator("row_span")
    @classmethod
    def _row_fits(cls, v: int, info) -> int:
        row = info.data.get("row")
        if row is not None and row + v > GRID_SIZE:
            raise ValueError(f"row + row_span must be <= {GRID_SIZE}")
        return v

    @field_validator("col_span")
    @classmethod
    def _col_fits(cls, v: int, info) -> int:
        col = info.data.get("col")
        if col is not None and col + v > GRID_SIZE:
            raise ValueError(f"col + col_span must be <= {GRID_SIZE}")
        return v


class WidgetUpdate(BaseModel):
    type: str | None = Field(default=None, min_length=1, max_length=64)
    row: int | None = Field(default=None, ge=0, le=GRID_SIZE - 1)
    col: int | None = Field(default=None, ge=0, le=GRID_SIZE - 1)
    row_span: int | None = Field(default=None, ge=1, le=GRID_SIZE)
    col_span: int | None = Field(default=None, ge=1, le=GRID_SIZE)
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
