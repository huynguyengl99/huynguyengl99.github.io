---
title: "ChanX: Structured, Type-Safe WebSockets for Django and FastAPI"
description: "A batteries-included WebSocket framework: automatic message routing with Pydantic, mypy/pyright type safety, auto-generated AsyncAPI docs, and testing utilities — one codebase for Django Channels and FastAPI."
pubDatetime: 2025-10-10T10:00:00+07:00
featured: true
tags:
  - python
  - django
  - fastapi
  - websocket
  - realtime
  - open-source
---

After years of building realtime applications — group messaging, voice pipelines, streaming AI assistants — I kept writing the same WebSocket boilerplate in every project. Whether in Django Channels or FastAPI, it always looked like this:

```python
# The usual mess
async def receive_json(self, content):
    action = content.get("action")
    if action == "chat":
        # manual validation, no types
        await self.handle_chat(content)
    elif action == "ping":
        await self.handle_ping(content)
    elif action == "join_room":
        await self.handle_join_room(content)
    # ... 20 more elif statements
```

Manual routing chains. Hand-written validation. Runtime type surprises. Zero documentation — no source of truth for what messages are accepted or returned, even though the AsyncAPI standard exists. Testing that's timing-based and unpredictable. Painful code reviews, because you can't tell what a consumer does without reading it end to end.

REST APIs solved all of this years ago with DRF and FastAPI: validation, type safety, auto-generated docs. **[ChanX](https://github.com/huynguyengl99/chanx)** brings that same developer experience to WebSockets.

## Table of contents

## The same code, structured

```python
@channel(name="chat", description="Real-time chat API")
class ChatConsumer(AsyncJsonWebsocketConsumer):
    groups = ["chat_room"]  # Auto-join this group on connect

    @ws_handler(
        summary="Handle chat messages",
        output_type=ChatNotificationMessage,
    )
    async def handle_chat(self, message: ChatMessage) -> None:
        # Automatically routed, validated, and type-safe
        await self.broadcast_message(
            ChatNotificationMessage(payload=message.payload)
        )

    @ws_handler
    async def handle_ping(self, message: PingMessage) -> PongMessage:
        return PongMessage()  # Auto-documented in AsyncAPI
```

Messages are Pydantic models with a discriminated `action` field — incoming messages are validated and routed to the right handler automatically. No if-else chains, no manual validation, and mypy/pyright catch mistakes before runtime.

## What you get

- **Automatic routing** via Pydantic discriminated unions
- **Type safety** with full mypy/pyright support and runtime validation
- **AsyncAPI 3.0 docs auto-generated** from your code — like Swagger, but for WebSockets. Frontend teams integrate from the contract, not by reading your backend
- **Broadcasting and groups** out of the box, with an event system to trigger WebSocket messages from anywhere — HTTP views, Celery tasks, management commands
- **A client generator CLI** that produces type-safe clients from the AsyncAPI schema
- **Testing utilities** that make WebSocket flows predictable instead of timing-based
- **One codebase, two frameworks** — the same decorator API works on Django Channels and FastAPI (via [fast-channels](https://github.com/huynguyengl99/fast-channels))

## Broadcasting from anywhere

```python
# From a Django view, Celery task, or FastAPI endpoint
ChatConsumer.broadcast_event_sync(
    NotificationEvent(payload={"alert": "System maintenance"}),
    groups=["admin_users"],
)
```

## Where it shines

- Realtime messaging — one-on-one or group chat with broadcasting and notifications
- Realtime voice or chat assistants (e.g. Deepgram, OpenAI) with streaming responses
- Any scenario involving group messaging or push notifications over WebSocket

I built ChanX from what I wished I had on my own projects, and I use it in production daily.

## Links

- GitHub: [huynguyengl99/chanx](https://github.com/huynguyengl99/chanx)
- PyPI: `pip install "chanx[channels]"` (Django) or `pip install "chanx[fast_channels]"` (FastAPI)
- Docs: [chanx.readthedocs.io](https://chanx.readthedocs.io/)
- Tutorials: [Django](https://chanx.readthedocs.io/en/latest/tutorial-django/prerequisites.html) · [FastAPI](https://chanx.readthedocs.io/en/latest/tutorial-fastapi/prerequisites.html)

Feedback, issues, and contributions are all welcome.
