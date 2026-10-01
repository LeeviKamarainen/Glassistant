"""Needle client — tiny on-device tool-calling model (https://github.com/cactus-compute/needle).

Needle turns one user sentence into structured tool calls in ~200 ms on CPU, but
it never writes free text and sees at most ~5 tools well. The agent's fast path
(app.agent.fast) uses it to try a command before falling back to the Ollama loop.

The engine is synchronous and holds global state (loaded weights), so calls are
serialised with a lock and pushed onto a worker thread. The agent is bound to one
toolset, so it is rebuilt only when the tool schemas change (e.g. a new custom
widget type appears in the enum).
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
from typing import Any


class NeedleUnavailable(RuntimeError):
    """The cactus-needle package is not installed or the engine failed to load."""


class NeedleService:
    def __init__(self, weights: str | None = None) -> None:
        self._weights = weights or None
        self._lock = threading.Lock()
        self._agent: Any = None
        self._agent_key: str | None = None

    def _complete_sync(self, query: str, tools: list[dict[str, Any]]) -> dict[str, Any]:
        # Needle sends anonymous usage counts by default; keep this opt-in.
        os.environ.setdefault("NEEDLE_TELEMETRY", "0")
        os.environ.setdefault("DO_NOT_TRACK", "1")
        os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
        try:
            import needle
        except ImportError as e:
            raise NeedleUnavailable(
                "cactus-needle is not installed (pip install -e .[needle])"
            ) from e

        key = json.dumps(tools, sort_keys=True)
        with self._lock:
            try:
                if self._agent is None or self._agent_key != key:
                    self._agent = needle.Needle(tools=tools, weights=self._weights)
                    self._agent_key = key
                # Each request is independent — only the latest user message is sent.
                self._agent.reset()
                return self._agent.complete(query)
            except Exception as e:  # engine download/load/runtime failures
                raise NeedleUnavailable(f"Needle failed: {e}") from e

    async def complete(self, query: str, tools: list[dict[str, Any]]) -> dict[str, Any]:
        return await asyncio.to_thread(self._complete_sync, query, tools)
