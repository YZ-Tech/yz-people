"""In-process event broadcaster for the people satellite.

Routes emit() events when state changes (person created/updated/deleted,
recording uploaded/deleted). /events WS subscribers receive them via
per-connection asyncio queues. The JarvYZ-side proxy tails this WS and
re-broadcasts onto JarvYZ's own /api/events for legacy consumers.

Mirrors music satellite's _emit/_ws_subscribers pattern, just simpler
(no observer thread — emits are all synchronous from FastAPI routes)."""
from __future__ import annotations

import asyncio
from typing import Any


_subscribers: set[asyncio.Queue] = set()


def subscribe() -> asyncio.Queue:
    """Register a new WS connection. Returns the queue it should
    `await q.get()` to receive events. Caller must `unsubscribe(q)` on
    disconnect."""
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def emit(kind: str, **payload: Any) -> None:
    """Fan out one event to every connected WS subscriber. Drop-on-overflow
    (asyncio.Queue is unbounded by default — keep it that way unless we
    see actual memory pressure)."""
    msg = {"event": "people", "kind": kind, **payload}
    for q in list(_subscribers):
        try:
            q.put_nowait(msg)
        except Exception:
            pass


def num_subscribers() -> int:
    return len(_subscribers)
