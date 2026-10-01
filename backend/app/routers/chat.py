"""POST /api/chat — streaming agent endpoint.

Returns text/event-stream with newline-delimited SSE events:
  {"type": "thinking_delta", "content": "..."}
  {"type": "text_delta",  "content": "..."}
  {"type": "needle", "outcome": "executed"|"fallback", "reason", "confidence", "threshold",
   "ms", "calls", "held", "reasoning"}      (fast mode only: what Needle proposed / why it fell back)
  {"type": "tool_start", "tool": "...", "args": {...}}
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
from app.agent.fast import run_fast_agent
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

    needle = getattr(request.app.state, "needle", None)
    min_confidence: float = request.app.state.settings.needle_min_confidence

    async def event_stream() -> AsyncIterator[str]:
        try:
            if body.fast and needle is not None:
                events = run_fast_agent(
                    body.messages, conn, broadcaster, ollama, needle, min_confidence
                )
            else:
                events = run_agent(body.messages, conn, broadcaster, ollama)
            async for event in events:
                yield _sse(event)
        except httpx.HTTPStatusError as e:
            yield _sse({"type": "error", "message": f"Ollama error {e.response.status_code}: {e.response.text[:200]}"})
        except httpx.ConnectError:
            yield _sse({"type": "error", "message": "Cannot connect to Ollama. Is it running?"})
        except Exception as e:
            yield _sse({"type": "error", "message": f"Agent error: {e}"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
