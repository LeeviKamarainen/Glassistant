from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.dependencies import get_broadcaster
from app.events import Broadcaster

router = APIRouter(prefix="/api", tags=["events"])

HEARTBEAT_INTERVAL_SECONDS = 15.0


@router.get("/events")
async def stream_events(
    request: Request,
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> StreamingResponse:
    async def generator() -> AsyncIterator[bytes]:
        async with broadcaster.subscribe() as queue:
            # Initial comment so the client knows the connection is open.
            yield b": connected\n\n"
            while True:
                if await request.is_disconnected():
                    return
                try:
                    event = await asyncio.wait_for(
                        queue.get(), timeout=HEARTBEAT_INTERVAL_SECONDS
                    )
                except asyncio.TimeoutError:
                    yield b": heartbeat\n\n"
                    continue
                # Sentinel published by the lifespan shutdown — close the
                # generator so the connection ends before uvicorn force-kills it.
                if event["type"] == "server_restarting":
                    return
                payload = json.dumps(event, default=str)
                yield f"data: {payload}\n\n".encode("utf-8")

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # disable nginx buffering if ever proxied
            "Connection": "keep-alive",
        },
    )
