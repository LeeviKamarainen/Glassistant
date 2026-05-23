from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.dependencies import get_broadcaster, get_db
from app.events import Broadcaster
from app.repositories import saved_layouts as saved_layouts_repo
from app.repositories import widgets as widgets_repo
from app.schemas.saved_layout import (
    LoadLayoutRequest,
    LoadLayoutResult,
    SavedLayoutCreate,
    SavedLayoutOut,
    SavedLayoutsOut,
)

router = APIRouter(prefix="/api/saved-layouts", tags=["saved-layouts"])


async def _publish_layout_changed(
    broadcaster: Broadcaster, conn: sqlite3.Connection
) -> None:
    from app.schemas.widget import LayoutOut

    layout = widgets_repo.list_widgets(conn)
    await broadcaster.publish(
        "layout_changed",
        {"widgets": [w.model_dump(mode="json") for w in layout]},
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("", response_model=SavedLayoutsOut)
def list_saved_layouts(
    conn: sqlite3.Connection = Depends(get_db),
) -> SavedLayoutsOut:
    return SavedLayoutsOut(layouts=saved_layouts_repo.list_saved_layouts(conn))


# ---------------------------------------------------------------------------
# Save current layout
# ---------------------------------------------------------------------------


@router.post("", response_model=SavedLayoutOut, status_code=status.HTTP_201_CREATED)
def create_saved_layout(
    body: SavedLayoutCreate,
    conn: sqlite3.Connection = Depends(get_db),
) -> SavedLayoutOut:
    try:
        return saved_layouts_repo.create_saved_layout(conn, body.name, body.description)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"a saved layout named '{body.name}' already exists",
        )


# ---------------------------------------------------------------------------
# Load a saved layout (replaces current widgets)
# ---------------------------------------------------------------------------


@router.post("/{layout_id}/load", response_model=LoadLayoutResult)
async def load_saved_layout(
    layout_id: int,
    body: LoadLayoutRequest = LoadLayoutRequest(),
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> LoadLayoutResult:
    try:
        loaded, skipped = saved_layouts_repo.load_saved_layout(
            conn, layout_id, body.known_types
        )
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    await _publish_layout_changed(broadcaster, conn)
    return LoadLayoutResult(widgets=loaded, skipped_types=skipped)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete("/{layout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_layout(
    layout_id: int,
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    if not saved_layouts_repo.delete_saved_layout(conn, layout_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="saved layout not found"
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
