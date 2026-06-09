"""Ollama HTTP client — thin wrapper over /api/chat."""
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

    async def stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        think: bool = True,
    ) -> AsyncIterator[dict[str, Any]]:
        """Streaming call — works with or without tool schemas.

        `think=True` asks Ollama to separate reasoning into `message.thinking`
        for models that support it (e.g. gemma4, qwen3, deepseek-r1). Models
        without thinking support reject the field with HTTP 400, so on that
        error we transparently retry once without it.
        """
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools
        if think:
            payload["think"] = True
        try:
            async with self._client.stream(
                "POST", f"{self._base_url}/api/chat", json=payload
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if line:
                        yield json.loads(line)
        except httpx.HTTPStatusError as e:
            if think and e.response.status_code == 400:
                async for chunk in self.stream(messages, tools=tools, think=False):
                    yield chunk
                return
            raise
