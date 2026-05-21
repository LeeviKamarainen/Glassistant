"""POST /api/chat — streaming agent endpoint.

Returns text/event-stream with newline-delimited SSE events:
  {"type": "text_delta",  "content": "..."}
  {"type": "tool_start",  "tool": "...", "args": {...}}
  {"type": "tool_result", "tool": "...", "result": "..."}
  {"type": "done"}
  {"type": "error",       "message": "..."}
"""
from __future__ import annotations

import json
import sqlite3
from collections.abc import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.dependencies import get_broadcaster, get_db
from app.events import Broadcaster
from app.schemas.chat import ChatRequest
from app.agent.loop import run_agent

router = APIRouter(prefix="/api", tags=["chat"])


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


@router.post("/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> StreamingResponse:
    ollama = getattr(request.app.state, "ollama", None)
    if ollama is None:
        async def _unavailable() -> AsyncIterator[str]:
            yield _sse({"type": "error", "message": "Ollama service is not configured."})
        return StreamingResponse(_unavailable(), media_type="text/event-stream")

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in run_agent(body.messages, conn, broadcaster, ollama):
                yield _sse(event)
        except httpx.HTTPStatusError as e:
            yield _sse({"type": "error", "message": f"Ollama error {e.response.status_code}: {e.response.text[:200]}"})
        except httpx.ConnectError:
            yield _sse({"type": "error", "message": "Cannot connect to Ollama. Is it running?"})
        except Exception as e:
            yield _sse({"type": "error", "message": f"Agent error: {e}"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
