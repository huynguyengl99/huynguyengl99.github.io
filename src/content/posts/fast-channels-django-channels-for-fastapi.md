---
title: "fast-channels: Django Channels for FastAPI"
description: "Bringing Django Channels' battle-tested consumer patterns and channel layers to FastAPI, Starlette, and any ASGI framework — group messaging, background workers, and cross-process communication included."
pubDatetime: 2025-09-15T10:00:00+07:00
tags:
  - python
  - fastapi
  - websocket
  - realtime
  - open-source
---

FastAPI's native WebSocket support is great for basic connections, but it falls short the moment you build something real. Try building a chat app or an agent system and you quickly hit walls:

```python
# Native FastAPI — limited to 1:1 communication
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    # ❌ Can't send to multiple connections
    # ❌ Can't message from background workers
    # ❌ No cross-process communication
```

FastAPI's own docs point to [encode/broadcaster](https://github.com/encode/broadcaster) for something more robust — but that repository has since been archived. And the official `ConnectionManager` example is in-memory, fragile, and doesn't scale past one process.

After years of working with Django Channels, I wanted its proven architecture in FastAPI. So I ported it: **[fast-channels](https://github.com/huynguyengl99/fast-channels)** brings Django Channels' consumer pattern and channel layers to any ASGI framework.

## Table of contents

## What you get

- **Group messaging** — broadcast to multiple WebSocket connections at once, backed by Redis
- **Cross-process communication** — send messages to WebSocket clients from HTTP endpoints, background workers, Celery tasks, or any script
- **Consumer pattern** — structured `connect`/`receive`/`disconnect` methods instead of a `while True` loop
- **Multiple backends** — in-memory for testing, Redis Queue for reliable messaging, Redis Pub/Sub for ultra-low latency
- **Testing framework** and full type hints throughout

## A quick example

```python
from fast_channels.consumer.websocket import AsyncWebsocketConsumer

class ChatConsumer(AsyncWebsocketConsumer):
    groups = ["chat_room"]
    channel_layer_alias = "chat"

    async def connect(self):
        await self.accept()
        await self.channel_layer.group_send(
            "chat_room",
            {"type": "chat_message", "message": "Someone joined!"},
        )

    async def receive(self, text_data=None, **kwargs):
        # Broadcast to all connections in the group
        await self.channel_layer.group_send(
            "chat_room",
            {"type": "chat_message", "message": f"Message: {text_data}"},
        )

    async def chat_message(self, event):
        await self.send(event["message"])
```

Wire it into FastAPI:

```python
app = FastAPI()
ws_app = FastAPI()
ws_app.add_websocket_route("/chat", ChatConsumer.as_asgi())
app.mount("/ws", ws_app)
```

And because the channel layer is shared, you can push messages to connected clients from anywhere — an HTTP endpoint, a worker, a cron job — without routing everything through the database.

## When to use it

Chat apps, live dashboards, notifications, collaborative tools, trading platforms — anything needing real-time bidirectional communication with more than one client at a time.

## Links

- GitHub: [huynguyengl99/fast-channels](https://github.com/huynguyengl99/fast-channels)
- PyPI: `pip install fast-channels[redis]`
- Docs: [fast-channels.readthedocs.io](https://fast-channels.readthedocs.io/)
- Tutorial: [step-by-step chat app guide](https://fast-channels.readthedocs.io/en/latest/tutorial/index.html)

Feedback and contributions welcome. If you want structured message routing, validation, and AsyncAPI docs on top of this foundation, check out the follow-up project: [chanx](https://github.com/huynguyengl99/chanx).
