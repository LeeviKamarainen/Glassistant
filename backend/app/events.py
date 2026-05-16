"""In-process Server-Sent-Events broadcaster.

Each subscriber gets an asyncio.Queue. publish() fans an event out to every
subscriber and drops events for queues that are full to keep memory bounded.
Designed for the single-process case (one Pi/dev backend); horizontal scale-out
would replace this with Redis pub/sub or similar.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

Event = dict[str, Any]


class Broadcaster:
    def __init__(self, queue_size: int = 100) -> None:
        self._subscribers: set[asyncio.Queue[Event]] = set()
        self._queue_size = queue_size

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[Event]]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=self._queue_size)
        self._subscribers.add(q)
        try:
            yield q
        finally:
            self._subscribers.discard(q)

    async def publish(self, event_type: str, payload: Any = None) -> None:
        event: Event = {"type": event_type, "payload": payload}
        for q in list(self._subscribers):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                # Slow subscriber: drop this event for them rather than block the producer.
                pass

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)
