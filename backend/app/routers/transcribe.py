"""POST /api/transcribe — audio transcription via Gemma 4 native audio input."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["transcribe"])


class TranscribeRequest(BaseModel):
    audio_b64: str
    mime_type: str = "audio/webm"


class TranscribeResponse(BaseModel):
    transcript: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(body: TranscribeRequest, request: Request) -> TranscribeResponse:
    ollama = getattr(request.app.state, "ollama", None)
    if ollama is None:
        raise HTTPException(status_code=503, detail="Ollama service is not configured.")
    transcript = await ollama.transcribe(body.audio_b64, body.mime_type)
    return TranscribeResponse(transcript=transcript)
