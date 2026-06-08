from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.dependencies import get_broadcaster, get_db
from app.events import Broadcaster
from app.repositories import custom_widgets as custom_widgets_repo
from app.repositories.custom_widgets import CustomWidgetError
from app.schemas.custom_widget import CustomWidgetCreate, CustomWidgetOut

router = APIRouter(prefix="/api", tags=["custom-widgets"])


async def _publish_custom_widgets_changed(
    broadcaster: Broadcaster, conn: sqlite3.Connection
) -> None:
    widgets = custom_widgets_repo.list_custom_widgets(conn)
    await broadcaster.publish(
        "custom_widgets_changed",
        {"widgets": [w.model_dump(mode="json") for w in widgets]},
    )


@router.get("/custom-widgets", response_model=list[CustomWidgetOut])
def list_custom_widgets(conn: sqlite3.Connection = Depends(get_db)) -> list[CustomWidgetOut]:
    return custom_widgets_repo.list_custom_widgets(conn)


@router.post(
    "/custom-widgets", response_model=CustomWidgetOut, status_code=status.HTTP_201_CREATED
)
async def create_custom_widget(
    body: CustomWidgetCreate,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> CustomWidgetOut:
    try:
        widget = custom_widgets_repo.create_custom_widget(conn, body)
    except CustomWidgetError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    await _publish_custom_widgets_changed(broadcaster, conn)
    return widget


@router.delete("/custom-widgets/{widget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_widget(
    widget_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> Response:
    if not custom_widgets_repo.delete_custom_widget(conn, widget_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="custom widget not found")
    await _publish_custom_widgets_changed(broadcaster, conn)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
