---
title: "Stop Reaching for APIView: Picking the Right DRF View Class"
description: "An in-depth take on DRF API design: when to reach for ModelViewSet, GenericViewSet with mixins, the concrete generic views, or plain APIView, and why the serializer is what makes the choice pay off."
pubDatetime: 2026-07-31T14:00:00+07:00
tags:
  - python
  - django
  - drf
  - api-design
---

There's a pattern I see in almost every DRF codebase, written by juniors and seniors alike. Views land at one of two extremes: either everything is an `APIView` with hand-written `post()` methods, or everything is a `ModelViewSet` wired up on autopilot because that's what the tutorial did. The whole middle of the library - generic viewsets, mixins, `CreateAPIView` and friends - goes untouched, usually because it's not obvious what any of it is *for*.

I spent years in that state myself. What changed my API work wasn't learning more DRF internals; it was picking a rule for **which class to use when**, and letting the serializer carry the weight. Here's the version of that rule I'd give my past self.

## Table of contents

## 1. Think in resources, not in endpoints

The single biggest upgrade is a mental one: stop designing "an API that does X" and start designing "a resource you can act on." Endpoints named `/create-order`, `/update-order-status`, `/get-my-orders` are functions with a URL. They multiply, they drift, and nobody can tell you what the API surface looks like without reading every view.

In DRF, the mechanism that keeps you honest here is the **serializer**. A serializer forces you to name the shape of the thing you're exposing, separately from the action being performed on it. Once the shape exists, the actions mostly fall out of REST: list it, retrieve it, create it, update it, delete it.

I'll admit I hated serializers at first. They felt like ceremony over a dict. What flipped it for me was pairing them with [drf-spectacular](https://drf-spectacular.readthedocs.io/): the serializer stopped being validation boilerplate and became **the contract and the documentation**. Now I sometimes declare a serializer purely so the generated schema is correct, even where I don't strictly need the validation - and that's still worth it.

## 2. Default to viewsets, trim with mixins

The simplest heuristic I have: **if the endpoint touches your database, it should almost certainly be a viewset.** Anything backed by a model is a resource with a lifecycle, whether or not you expose every action today. `ModelViewSet` when you genuinely want all six actions; `GenericViewSet` plus exactly the mixins you need when you don't.

That second half is the part people skip. "I only need list and retrieve" is not a reason to fall back to `APIView` - it's a reason to compose:

```python
class InvoiceViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
```

You get filtering, pagination, permission classes, and correct schema generation for free, and the URL surface stays a resource rather than a pile of verbs. A read-only resource is still a resource.

The real work inside a viewset is the serializer, and specifically `get_serializer_class`. Different actions almost always want different shapes - a light payload for `list`, a fuller one for `retrieve`, a write shape that accepts IDs where the read shape nests objects:

```python
def get_serializer_class(self):
    if self.action == "list":
        return InvoiceListSerializer
    if self.action in ("create", "update", "partial_update"):
        return InvoiceWriteSerializer
    return InvoiceSerializer
```

Spend your time here. This method is what makes the generated docs precise, and precise docs are what let consumers use the API correctly without asking you.

## 3. `APIView` is the exception, not the starting point

Flip the heuristic around: if the endpoint isn't accessing a resource of yours, ask why it exists at all. Most of the time the answer reveals a resource you hadn't named yet.

But some things genuinely aren't resource access, and `APIView` is right for them:

- **Health checks** - nothing to serialize, nothing to REST-ify.
- **Third-party callbacks and webhooks** - Stripe decides the URL shape and the payload, not you. These do write to your database, but as a side effect of an external event, not as someone accessing a resource, so the viewset rule doesn't apply.

Even then, and *especially* for webhooks, declare `serializer_class` (or `get_serializer_class`). A Stripe webhook handler is one of the highest-stakes endpoints you own, and the two things it needs most are validated input and documentation that says what the payload actually looks like. A serializer gives you both, and keeps the endpoint from being a blind spot in your schema.

## 4. Where the concrete generic views earn their place

For a long time I couldn't name a real use case for `CreateAPIView`, `RetrieveUpdateDestroyAPIView`, and the rest. I used them next to viewsets out of habit, before I understood mixins, and it worked well enough that I never questioned it.

The case where they're clearly the *right* tool: **resources you access through the current user rather than through an ID.** `/me`, `/workspaces/20/me`, `/me/settings`. These are real resources with a full read/update/delete lifecycle, but the lookup doesn't come from the URL - it comes from the session, plus whatever the URL nests it under:

```python
class WorkspaceMeView(RetrieveUpdateDestroyAPIView):
    serializer_class = WorkspaceMemberSerializer

    def get_object(self):
        return get_object_or_404(
            WorkspaceMember,
            workspace_id=self.kwargs["workspace_id"],
            user=self.request.user,
        )
```

One class, one `get_object`, three HTTP methods handled correctly. Done with `APIView` this becomes three views (or one view with three methods) that each re-derive the same object and each re-implement serialization. Done with a viewset, you'd be fighting the router over a resource that has no id in its URL.

That's the sweet spot: **a single object with a lifecycle, but no id-based lookup.**

## 5. Read your own API docs, then generate a client from them

The last habit, and the one that keeps the rest honest: actually open the generated schema and read it. Is that field read-only or write-only? Is the type right, or did DRF guess something loose that needs an explicit field or an `extra_kwargs` override? Are the required flags correct?

Then go one step further and **generate your frontend client from that schema** - TypeScript types and an API client, ideally regenerated in CI. Every field you forget to remove, every field you forget to add, becomes a compile error instead of a production surprise. Anyone who has hand-maintained an API client has shipped a stale field at least once; I've written more about that full setup in [Schema-First API Development with DRF + React](https://huynguyengl99.github.io/posts/schema-first-api-development-drf-react/).

## The short version

| Situation | Use |
| --- | --- |
| Model-backed resource, full lifecycle | `ModelViewSet` |
| Model-backed resource, only some actions | `GenericViewSet` + mixins |
| Single object, no id in URL (`/me`) | `RetrieveUpdateDestroyAPIView` and friends |
| Not a resource (health check, webhook) | `APIView` - still declare a serializer |

Since I started applying this, I've never been unsure which class to reach for, and I've stopped worrying about whether consumers are using an endpoint the way I intended. The serializer says what the resource is, the view class says what you can do to it, and the schema tells everyone else. That's most of good API design, and DRF hands it to you if you use the middle of the library instead of just its edges.
