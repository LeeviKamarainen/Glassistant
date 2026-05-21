"""ReAct agent loop with two-phase context management.

Phase 1 — tool-use: non-streaming LLM calls with tool schemas, trimmed history.
Phase 2 — synthesis: streaming LLM call WITHOUT tool schemas (saves ~800 tokens).

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

# Concise — local models degrade on verbose system prompts.
SYSTEM_PROMPT = (
    "You are Glassistant, an AI assistant for a smart mirror home dashboard. "
    "The dashboard shows widgets on a configurable grid. "
    "Always call list_widgets before adding or moving anything. "
    "Be concise."
)

MAX_ITERS = 6       # max tool-use rounds before forcing synthesis
MAX_HISTORY = 6     # non-system messages kept per LLM call
RESULT_LIMIT = 600  # max chars per tool result string


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

    # ── Tool-use phase ──────────────────────────────────────────────────────────
    for _ in range(MAX_ITERS):
        resp = await ollama.chat(_trim(history), tools=TOOL_SCHEMAS)
        msg = resp.get("message", {})
        text: str = msg.get("content") or ""
        tool_calls: list[dict[str, Any]] = msg.get("tool_calls") or []

        assistant_entry: dict[str, Any] = {"role": "assistant", "content": text}
        if tool_calls:
            assistant_entry["tool_calls"] = tool_calls
        history.append(assistant_entry)

        if not tool_calls:
            # Model answered directly — this IS the final response.
            if text:
                yield {"type": "text_delta", "content": text}
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

    # ── Synthesis phase (streaming, no tool schemas) ─────────────────────────
    async for chunk in ollama.stream(_trim(history)):
        delta: str = chunk.get("message", {}).get("content", "") or ""
        if delta:
            yield {"type": "text_delta", "content": delta}

    yield {"type": "done"}
