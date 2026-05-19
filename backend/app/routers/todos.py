from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.dependencies import get_broadcaster, get_db
from app.events import Broadcaster
from app.repositories import todos as todos_repo
from app.schemas.todo import TodoCreate, TodoOut, TodoUpdate

router = APIRouter(prefix="/api", tags=["todos"])


@router.get("/todos", response_model=list[TodoOut])
def list_todos(conn: sqlite3.Connection = Depends(get_db)) -> list[TodoOut]:
    return todos_repo.list_todos(conn)


@router.post("/todos", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
async def create_todo(
    body: TodoCreate,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> TodoOut:
    todo = todos_repo.create_todo(conn, body)
    await broadcaster.publish("todos_changed", {})
    return todo


@router.patch("/todos/{todo_id}", response_model=TodoOut)
async def update_todo(
    todo_id: int,
    body: TodoUpdate,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> TodoOut:
    todo = todos_repo.update_todo(conn, todo_id, body)
    if todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="todo not found")
    await broadcaster.publish("todos_changed", {})
    return todo


@router.delete("/todos/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> Response:
    if not todos_repo.delete_todo(conn, todo_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="todo not found")
    await broadcaster.publish("todos_changed", {})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
