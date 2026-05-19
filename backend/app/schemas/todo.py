from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TodoCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    due_date: str | None = None  # "YYYY-MM-DD"
    icon: str | None = Field(default=None, max_length=10)


class TodoUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    due_date: str | None = None
    icon: str | None = Field(default=None, max_length=10)
    done: bool | None = None


class TodoOut(BaseModel):
    id: int
    name: str
    description: str | None
    due_date: str | None
    icon: str | None
    done: bool
    created_at: datetime
    updated_at: datetime
