---
title: "Agent Graph Engineering, Part 9: Practices for Both Services"
description: "The patterns that make the Django side and the agent side adoptable rather than just readable. Two layers of authorization instead of one, secure-by-default enums, polymorphic events that reach TypeScript as a union, and production-safe settings with dev as the layer that loosens them."
ogImage: ./_images/cover-09.png
pubDatetime: 2026-11-13T12:00:00+07:00
tags:
  - django
  - fastapi
  - architecture
  - python
  - ai-agents
series: "Agent Graph Engineering"
seriesOrder: 9
---

> **TL;DR** The architecture posts are no use if the code inside each service is sloppy. On the business side: authorize in two layers because a scoped queryset still lets an owner destroy their own record, choose serializers per action, default your enums to the safe value, and let a polymorphic model become a discriminated union the frontend can exhaust. Make `base.py` the production-safe settings and `dev.py` the one that loosens them. On the agent side: build agents per request rather than at import, and respect import-time ordering because tracing has to exist before the first model call.

Eight posts of architecture, and none of it helps if the inside of each service is a mess. This post is the one most likely to be useful if you are adapting the repo rather than reading it, because these are the decisions that do not show up in a diagram.

Two services, two sets of habits. They have less in common than you would hope.

## Table of contents

## The business service

### Authorize in two layers, because one is not enough

The reflex in Django is to scope the queryset and move on. A customer sees their own tickets, so filter by owner:

```python
def get_queryset(self) -> QuerySet[Ticket]:
    tickets = super().get_queryset()
    if self.request.user.is_staff:
        return tickets
    return tickets.filter(created_by=self.request.user)
```

That is necessary and it is not sufficient. The permission class next to it explains why better than I can:

```python
class StaffWrites(BasePermission):
    """Read your own, open a new one, change nothing.

    Scoping the queryset is not enough: a customer owns their ticket and could
    otherwise close it, raise its priority, or delete it along with every event
    on it.
    """
```

That is the gap. A scoped queryset answers _which rows can I reach_, and says nothing about _what may I do to them_. The customer owns the ticket, so it is in their queryset, so a `DELETE` succeeds and takes every event on it along with the cascade. They can also mark it resolved, or set it to urgent, neither of which is theirs to decide.

The two questions are genuinely different and both need answering. Visibility is the queryset. Capability is the permission class. I have shipped the version that only had the first one.

A related trap worth naming: when I tidied this codebase's view documentation I removed a line and accidentally left `destroy` without the permission, which meant a customer could delete their own ticket. It was caught by a test that asserted on the access rules rather than on the happy path. Write that test.

### A serializer per action

One viewset, three shapes:

```python
def get_serializer_class(self) -> type[BaseSerializer[Any]]:
    if self.action == "create":
        return TicketCreateSerializer
    if self.action in ("update", "partial_update"):
        return TicketUpdateSerializer
    return TicketSerializer
```

Creating a ticket, changing one, and reading one are three different contracts. Collapsing them into one serializer means either accepting fields on create that only staff may set, or marking half the fields read-only and then fighting that on update.

The payoff is not only correctness. Because these are separate serializers, the generated OpenAPI describes three distinct shapes, so the generated client knows that create takes a title and a description while update takes a status and a priority. One serializer produces one vague shape and the frontend guesses.

### Default the enum to the safe value

Small, and I would put it in every codebase:

```python
class Visibility(models.TextChoices):
    """Who an event is for.

    Internal by default, so reaching the customer is the deliberate act. A
    requester's own message is public because they wrote it.
    """
    INTERNAL = "internal", "Internal"
    PUBLIC = "public", "Public"
```

Internal is first, which makes it the default. So a new event type added a year from now, by someone who has not read this, is staff-only until somebody deliberately makes it public. The failure mode of forgetting is a colleague not seeing something, rather than a customer seeing an internal note.

Order your enums so that forgetting is safe. It costs nothing at the time and it is the difference between an inconvenience and an incident.

### Let the polymorphism reach the frontend

Ticket activity is one polymorphic base with concrete subclasses: comments, status changes, AI responses, reasoning, tool calls, handoffs. That is a reasonable Django modeling choice on its own, and the reason it is the right one here is what happens at the edges.

A polymorphic model surfaces in OpenAPI as a **discriminated union**, which reaches TypeScript as a discriminated union, which means the frontend can switch exhaustively over event types and the compiler complains when a new one appears. Adding an event type is one model, one serializer, one mapping entry, and a regeneration. Nobody hand-writes a type, and no `switch` silently falls through to a default that renders nothing.

There is a schema hook in the repo called `force_discriminator_required`, which exists because a discriminator that the generator treats as optional produces a union the frontend cannot narrow. Worth knowing that the generated-contract path occasionally needs a nudge like this to produce types that are actually useful.

### Do not repeat your schema decoration

Every action on a viewset repeats the same tag and parameters, so the repetition is factored out:

```python
def tagged(tag: str, **shared: Any) -> Callable[..., Any]:
    """An `extend_schema` that already carries a viewset's tag and parameters,
    so each action declares only what it alone says."""
```

Then each action declares only its own summary. This is unglamorous and it matters because schema decoration is exactly the kind of boilerplate people stop maintaining. If documenting an endpoint is one short line, it gets done. If it is twelve lines of repeated decorator, the sixth endpoint gets none and your generated client gets worse.

One caution learned the hard way: if you delete a description entirely, the generator may fall back to the class docstring, so six endpoints end up documented identically and nobody notices because the schema still validates. Say something real or say nothing deliberately.

### Make production the default and development the exception

The settings layout is the inverse of what I used to write:

```python
# base.py
SECRET_KEY = env.str("DJANGO_SECRET_KEY", "django-insecure-change-me")
DEBUG = env.bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS: list[str] = env.list("DJANGO_ALLOWED_HOSTS", [])
```

```python
# dev.py
from .base import *
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0"]
CORS_ALLOW_ALL_ORIGINS = True
```

`base.py` is safe to deploy. `dev.py` is the file that opens things up. Containers run `base` with debug off and nothing extra.

The usual arrangement is the other way around: a permissive base plus a `production.py` that tightens it. The difference shows up when someone forgets to set the settings module, and in that arrangement forgetting means shipping with `DEBUG = True` and wide-open CORS. Here, forgetting means a service that refuses connections until you set `ALLOWED_HOSTS`, which is a loud failure instead of a silent one.

There is a nice detail in that dev file too. `daphne` is injected into `INSTALLED_APPS` only in development, with a comment explaining that listing it in base meant a production install could not even import the settings, since the production server is granian and daphne is not installed there. Dependencies that exist only for a dev convenience belong only in the dev layer.

### Keep the async boundary explicit

The Django side is sync and the agent-driving side is async, which is a seam that produces strange bugs if it is implicit. ORM work called from async code goes through `database_sync_to_async`, named at the call site, so you can see where you are crossing. The alternative, async-looking functions that secretly block an event loop, is a performance problem you will not find by reading.

## The agent service

### Build per request, not at import

[Part 4](/posts/agent-graph-engineering/the-agent-and-the-graph/) mentioned this and it is worth stating as a practice. Agents are constructed when a request arrives, because the model filling each role is resolved from configuration at that moment. Construct them at import and you freeze whatever the config said at boot, so changing a model means a redeploy, and a per-tenant model preference is impossible.

The secondary benefit is testing. A test builds an agent against a scripted model by passing different config. Nothing global is patched, so tests do not interfere with each other.

### Import order is a real constraint

The one that will catch you:

> `setup_tracing()` is called at import, before any `Agent` is constructed. Later and the first model call has no provider to report to.

Instrumentation has to be installed before the thing it instruments exists. Get the ordering wrong and tracing works for every call except the first, which is the kind of bug you dismiss as a fluke three times before investigating.

If your service has an import-order requirement, put it in a comment at the place that depends on it. A future reader reorganizing imports has no other way to know.

## The habits that apply on both sides

### Structured logs, and log the failures you invented

Every log line here is structlog with key-value pairs rather than an interpolated sentence, which means a production log is queryable rather than greppable.

More importantly: log the failures that only you know about. This codebase emits `agent_run.invalid_frame`, `agent_run.connection_failed`, `support.claim_taken_over` and `tickets.withheld_from_customer`. None of those are exceptions a framework would report. They are domain events that mean something went wrong in a way that is invisible from the outside.

That list exists because of a bug where a reply vanished silently. The fix that mattered was not the code change, it was making the failure announce itself. If you have a path where something can be dropped, a log line on that path is the cheapest possible instrumentation.

**Let the thing that knows the rule enforce the rule.** A tool declares `requires_approval=True` and the graph reads it. An enum defaults to internal. A permission class owns capability. Pushing the decision to where the knowledge lives means adding a case cannot skip the check.

**Comment the scar, not the syntax.** Almost every comment I have quoted across this series explains a decision or a failure, never what the code does. The note in the dev settings saying daphne was moved out of base because a production install could not import the settings is worth twenty lines of description. A comment restating the code is worse than nothing.

**Say what you are not doing.** The README has a section listing what is deliberately not done yet. A reader who cannot tell the difference between a gap and an oversight has to assume everything is an oversight.

## What it costs

Two layers of authorization is two places to change when the rules change, and they can disagree. The mitigation is tests that assert on access rules directly.

A serializer per action is more classes. Worth it at the boundary, excessive inside.

Production-safe defaults make the first local run slightly less pleasant, since you have to set things before it will start. `just setup` writes them, which is the right place for that friction.

Next up is observability: tracing a single message end to end, seeing the graph, and what a run actually cost. Hope this one is useful, and if you only take one thing, take the enum ordering. It is free.

I write these deep-dives and maintain a handful of Python libraries, so if that is your kind of thing, follow along on [GitHub](https://github.com/huynguyengl99) and [LinkedIn](https://www.linkedin.com/in/huynguyengl99/).
