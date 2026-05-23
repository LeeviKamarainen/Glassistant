"""ReAct agent loop — fully streaming.

Each iteration streams from Ollama with tool schemas, yielding text_delta events
as tokens arrive. Tool calls are accumulated from the stream chunks and processed
after the stream completes. If no tools were called, the streamed text IS the final
response. A synthesis pass runs only if all MAX_ITERS were exhausted by tool calls.

History is trimmed to MAX_HISTORY turns per call to keep context small for local models.
Tool results are truncated at RESULT_LIMIT characters.
"""
from __future__ import annotations

import sqlite3
from collections.abc import AsyncIterator
from typing import Any

from app.agent.tools import TOOL_SCHEMAS, dispatch
from app.events import Broadcaster
from app.schemas.chat import ChatMessage
from app.services.ollama import OllamaService

SYSTEM_PROMPT = (
    "You are Glassistant, an AI assistant for a smart mirror home dashboard. "
    "The dashboard shows widgets on a configurable grid. "
    "Always call list_widgets before adding or moving anything. "
    "Be concise."
)

MAX_ITERS = 6
MAX_HISTORY = 6
RESULT_LIMIT = 600


def _trim(history: list[dict[str, Any]], max_turns: int = MAX_HISTORY) -> list[dict[str, Any]]:
    system = [m for m in history if m["role"] == "system"]
    rest = [m for m in history if m["role"] != "system"]
    return system + rest[-max_turns:]


def _compact(result: str) -> str:
    if len(result) > RESULT_LIMIT:
        return result[:RESULT_LIMIT] + " …[truncated]"
    return result


async def run_agent(
    messages: list[ChatMessage],
    conn: sqlite3.Connection,
    broadcaster: Broadcaster,
    ollama: OllamaService,
) -> AsyncIterator[dict[str, Any]]:
    history: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    history += [{"role": m.role, "content": m.content} for m in messages]

    for _ in range(MAX_ITERS):
        accumulated_text = ""
        tool_calls: list[dict[str, Any]] = []

        async for chunk in ollama.stream(_trim(history), tools=TOOL_SCHEMAS):
            msg = chunk.get("message", {})
            delta: str = msg.get("content", "") or ""
            chunk_tools: list[dict[str, Any]] = msg.get("tool_calls") or []

            if delta:
                accumulated_text += delta
                yield {"type": "text_delta", "content": delta}

            if chunk_tools:
                tool_calls.extend(chunk_tools)

        assistant_entry: dict[str, Any] = {"role": "assistant", "content": accumulated_text}
        if tool_calls:
            assistant_entry["tool_calls"] = tool_calls
        history.append(assistant_entry)

        if not tool_calls:
            yield {"type": "done"}
            return

        for tc in tool_calls:
            fn = tc.get("function", {})
            name: str = fn.get("name", "")
            args: dict[str, Any] = fn.get("arguments") or {}

            yield {"type": "tool_start", "tool": name, "args": args}
            result = _compact(await dispatch(name, args, conn, broadcaster))
            yield {"type": "tool_result", "tool": name, "result": result}

            history.append({"role": "tool", "content": result, "tool_name": name})

    # All iterations used tools — stream a final synthesis pass without tool schemas
    async for chunk in ollama.stream(_trim(history)):
        delta: str = chunk.get("message", {}).get("content", "") or ""
        if delta:
            yield {"type": "text_delta", "content": delta}

    yield {"type": "done"}
