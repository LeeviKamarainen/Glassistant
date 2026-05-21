"""Ollama HTTP client — thin wrapper over /api/chat.

Two methods:
  chat()   — stream=false, supports tool schemas (required by Ollama for tool calling)
  stream() — stream=true,  no tools; used for the final synthesis pass to save context
"""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx


class OllamaService:
    def __init__(self, base_url: str, model: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._client = httpx.AsyncClient(timeout=120.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Non-streaming call. Returns the full response dict."""
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
        resp = await self._client.post(f"{self._base_url}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def stream(self, messages: list[dict[str, Any]]) -> AsyncIterator[dict[str, Any]]:
        """Streaming call without tools — for the synthesis (final answer) pass."""
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": True,
        }
        async with self._client.stream(
            "POST", f"{self._base_url}/api/chat", json=payload
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                line = line.strip()
                if line:
                    yield json.loads(line)
