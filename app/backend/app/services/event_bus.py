from __future__ import annotations

import asyncio
import threading
from collections import deque
from collections.abc import AsyncIterator
from typing import Any, Literal

from app.models.schemas import AutomationEvent
from app.services.redaction import redact_event_message, redact_event_payload


class EventBus:
    def __init__(self, history_size: int = 100) -> None:
        self._history: deque[AutomationEvent] = deque(maxlen=history_size)
        self._subscribers: dict[asyncio.Queue[AutomationEvent], asyncio.AbstractEventLoop] = {}
        self._lock = threading.Lock()

    def publish(
        self,
        event_type: str,
        message: str = "",
        status: Literal["info", "running", "success", "warning", "error"] = "info",
        payload: dict[str, Any] | None = None,
    ) -> AutomationEvent:
        event = AutomationEvent(
            event_type=event_type,
            status=status,
            message=redact_event_message(message),
            payload=redact_event_payload(payload or {}),
        )
        with self._lock:
            self._history.append(event)
            subscribers = list(self._subscribers.items())
        for queue, loop in subscribers:
            try:
                loop.call_soon_threadsafe(self._put_nowait, queue, event)
            except RuntimeError:
                with self._lock:
                    self._subscribers.pop(queue, None)
        return event

    async def listen(self) -> AsyncIterator[AutomationEvent]:
        queue: asyncio.Queue[AutomationEvent] = asyncio.Queue(maxsize=100)
        loop = asyncio.get_running_loop()
        with self._lock:
            history = list(self._history)
            self._subscribers[queue] = loop
        for event in history:
            self._put_nowait(queue, event)
        try:
            while True:
                yield await queue.get()
        finally:
            with self._lock:
                self._subscribers.pop(queue, None)

    def _put_nowait(
        self, queue: asyncio.Queue[AutomationEvent], event: AutomationEvent
    ) -> None:
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass
