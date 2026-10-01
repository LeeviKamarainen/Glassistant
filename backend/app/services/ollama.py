"""Ollama HTTP client — thin wrapper over /api/chat."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx


class OllamaService:
    def __init__(self, base_url: str, model: str, transcription_model: str | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._transcription_model = transcription_model or model
        self._client = httpx.AsyncClient(timeout=120.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        think: bool = False,
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
            "options": {
                "temperature": 1.0,
                "top_p": 0.95,
                "top_k": 64,
            },
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

    async def transcribe(self, audio_b64: str, mime_type: str = "audio/wav") -> str:
        """Transcribe audio using the smaller Gemma 4 model via Ollama.

        Ollama detects audio by inspecting RIFF/WAVE magic bytes in the `images`
        field. Audio must be 16 kHz mono WAV (frontend handles conversion).
        A system message locks the model into pure transcription mode so it
        does not answer or react to the audio content.
        """
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a speech-to-text transcription engine. "
                    "Your only task is to transcribe exactly what is spoken in the audio. "
                    "Do not answer questions, do not comment, do not add any text "
                    "that was not spoken. Output the verbatim transcription only."
                ),
            },
            {
                "role": "user",
                "content": "Transcribe the following speech segment in English into English text.",
                "images": [audio_b64],
            },
        ]
        payload: dict[str, Any] = {
            "model": self._transcription_model,
            "messages": messages,
            "stream": False,
            "options": {"num_ctx": 8192},
        }
        resp = await self._client.post(f"{self._base_url}/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
        return str(data["message"]["content"]).strip()
