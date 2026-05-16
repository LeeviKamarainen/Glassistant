from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.dependencies import get_broadcaster, get_db
from app.events import Broadcaster
from app.repositories import widgets as widgets_repo
from app.repositories.widgets import WidgetError
from app.schemas.widget import LayoutOut, WidgetCreate, WidgetOut, WidgetUpdate

router = APIRouter(prefix="/api", tags=["layout"])


async def _publish_layout_changed(
    broadcaster: Broadcaster, conn: sqlite3.Connection
) -> None:
    layout = widgets_repo.list_widgets(conn)
    await broadcaster.publish(
        "layout_changed",
        {"widgets": [w.model_dump(mode="json") for w in layout]},
    )


@router.get("/layout", response_model=LayoutOut)
def get_layout(conn: sqlite3.Connection = Depends(get_db)) -> LayoutOut:
    return LayoutOut(widgets=widgets_repo.list_widgets(conn))


@router.post("/widgets", response_model=WidgetOut, status_code=status.HTTP_201_CREATED)
async def create_widget(
    body: WidgetCreate,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> WidgetOut:
    try:
        widget = widgets_repo.create_widget(conn, body)
    except WidgetError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    await _publish_layout_changed(broadcaster, conn)
    return widget


@router.patch("/widgets/{widget_id}", response_model=WidgetOut)
async def update_widget(
    widget_id: int,
    body: WidgetUpdate,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> WidgetOut:
    try:
        widget = widgets_repo.update_widget(conn, widget_id, body)
    except WidgetError as e:
        msg = str(e)
        code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in msg
            else status.HTTP_409_CONFLICT
        )
        raise HTTPException(status_code=code, detail=msg)
    await _publish_layout_changed(broadcaster, conn)
    return widget


@router.delete("/widgets/{widget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_widget(
    widget_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> Response:
    if not widgets_repo.delete_widget(conn, widget_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="widget not found")
    await _publish_layout_changed(broadcaster, conn)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/layout/reset", response_model=LayoutOut)
async def reset_layout(
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> LayoutOut:
    widgets = widgets_repo.reset_to_defaults(conn)
    await _publish_layout_changed(broadcaster, conn)
    return LayoutOut(widgets=widgets)
