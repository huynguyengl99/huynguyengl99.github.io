---
title: "Schema-First API Development with DRF + React: OpenAPI as the Contract"
description: "How my team ships DRF + React features without ever hitting a mistyped param or outdated API call: drf-spectacular as the source of truth, generated zod clients, auto-generated forms, and strict typing on both sides."
pubDatetime: 2026-07-11T15:00:00+07:00
featured: true
tags:
  - python
  - django
  - drf
  - react
  - typescript
  - openapi
  - type-safety
---

Every team that splits backend and frontend eventually meets the same class of bug: the backend renames a field, the frontend keeps sending the old one, and nothing complains until a user hits the broken flow in production. Mistyped params, outdated payloads, response shapes that drifted — none of them are hard bugs individually, but they're *silent*, and silence is what makes them expensive.

For the past few years, my team has been running a setup where this class of bug essentially doesn't exist: **the OpenAPI schema is the protocol between backend and frontend**. The backend generates it, the frontend generates *from* it, and type checkers on both sides refuse to compile anything that violates it. We haven't faced an outdated or mistyped API call since.

This post is the full recipe for Django REST Framework + React — but the pattern generalizes to any stack. You need exactly three ingredients:

1. **An API contract** (OpenAPI here, could be AsyncAPI, GraphQL SDL, protobuf)
2. **A type checker on each side** (mypy/pyright + TypeScript)
3. **Lint + tests wired into git** so nothing changes silently

## Table of contents

## The big picture

```
DRF serializers ──▶ drf-spectacular ──▶ /api/schema/ (the live contract)
                                             │
                          ┌──────────────────┤
                          ▼                  ▼
                   zod schemas         TypeScript types
                          │                  │
                          ▼                  ▼
                   zodios API client   auto-generated forms
```

With drf-spectacular you can serve the schema directly as an endpoint (`SpectacularAPIView` at `/api/schema/`), so the frontend can fetch the contract straight from the API — local or staging — always in sync with the code by construction. In stricter environments you might prefer exporting a schema file and committing it instead; either works, it's up to your workflow. We fetch live, and commit only the *generated* frontend files.

The critical property: **nothing downstream is written by hand.** When a serializer changes, you regenerate, and TypeScript immediately tells you every place the frontend just became wrong. The contract change is loud, visible in the diff of the generated files, and impossible to merge accidentally.

## Backend: serializers are the contract

### Why DRF (and not Django Ninja)

Django Ninja is great, and its FastAPI-style ergonomics are genuinely pleasant. We still prefer DRF for schema-first work, for one main reason: **ViewSets model an API *kind*, not a function.**

A ViewSet groups the list/retrieve/create/update/destroy operations of one resource, and that group carries shared configuration: reusable **permission classes** (instead of manually decorating every function), throttling, filtering, plus OpenAPI `tags` and descriptions that keep the generated schema organized. When your generated client is grouped by tag — one file per resource — that structure pays off directly on the frontend.

```python
class ProjectViewSet(ModelViewSet[Project]):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, IsProjectMember]  # reused, not repeated

    def get_serializer_class(self) -> type[BaseSerializer[Project]]:
        if self.action == "list":
            return ProjectListSerializer  # lighter payload for lists
        return super().get_serializer_class()
```

The habit: **always define `serializer_class` (and `queryset`)**, and override `get_serializer_class()` when an action needs a different shape. drf-spectacular reads these to build the schema — a view without a declared serializer is a hole in your contract.

### Strictly follow the schema — it's a skill

Here's the honest part: writing serializers that produce a *correct* OpenAPI schema is hard at first. Read-only fields, write-only fields, nested reads with flat writes, defaults, nullability — each needs to be expressed so the schema says exactly what the API does. You will fight it for the first few weeks.

But it's a skill that converges. Once you're familiar, you always know how to define an API correctly on the first pass, and the payoff compounds: every serializer you write generates a client, types, and a form for free.

Some hard-won drf-spectacular settings that matter:

```python
SPECTACULAR_SETTINGS = {
    # Split request/response components. Without this, read-only fields
    # (id, timestamps) leak into request schemas and break FE mutations.
    "COMPONENT_SPLIT_REQUEST": True,

    # snake_case on the wire is a Python-ism; camelCase for JS consumers.
    "CAMELIZE_NAMES": True,

    # Name your enums, or generic fields like `status` collide
    # in the component registry across models.
    "ENUM_NAME_OVERRIDES": {
        "TaskStatusEnum": "app.models.Task.Status.choices",
    },

    # Custom postprocessing hooks — ordering matters (enums resolve
    # before discriminator checks).
    "POSTPROCESSING_HOOKS": [...],
}
```

Two gotchas worth calling out:

- **Name enum-ish fields by concept, not just `status`/`type`/`role`.** Generic names collide in the component registry; `task_status` generates a component that stays unique and self-describing.
- **Polymorphic types need required discriminators.** If you use discriminated unions (e.g. message subtypes), add a postprocessing hook that forces the discriminator field to `required` — otherwise the generated zod schemas mark it optional and validation falls apart.

### Serializer patterns that come up constantly

A few recurring shapes once you commit to "the schema must be exactly right":

**Nested read, flat write.** The UI wants the full related object when reading, but should send only an ID when writing. A small custom related field expresses this once, and the schema shows both shapes correctly (this is also exactly what `COMPONENT_SPLIT_REQUEST` exists for):

```python
class ProjectSerializer(ModelSerializer[Project]):
    owner = NestedReadFlatWriteField(serializer=UserSummarySerializer)
    # read:  {"owner": {"id": 7, "name": "..."}}
    # write: {"owner": 7}
```

**Defaults must be declared on the serializer.** Model-level defaults don't automatically reach the OpenAPI schema. Declaring them via `extra_kwargs` (or explicit serializer fields) exports them into the contract, and the frontend picks them up as `ZodDefault` — which auto-forms then use to prefill fields:

```python
class Meta:
    model = Task
    fields = ["id", "title", "priority"]
    extra_kwargs = {"priority": {"default": Priority.MEDIUM}}
```

**A lightweight schema variant.** All those `help_text` descriptions are great for API docs but dead weight in a client bundle. Serving a second schema endpoint with descriptions stripped (a tiny `AutoSchema` subclass) and generating the client from that cut our generated-code size dramatically, while the full-fat schema stays available for the docs UI.

### Backend typing: mypy + pyright

We run **both** mypy (strict) and pyright on the backend:

```ini
[mypy]
strict = true
plugins = mypy_django_plugin.main, mypy_drf_plugin.main

[mypy.plugins.django-stubs]
django_settings_module = "config.settings.dev"
```

Django and DRF are metaprogramming-heavy — model managers, `objects`, serializer fields — so the mypy plugin from django-stubs is what makes types actually *work* rather than being `Any` soup. It's slow, which is why we run pyright too for fast in-editor feedback, and we're watching [ty](https://github.com/astral-sh/ty) with interest — once it grows the analysis hooks that Django's metaprogramming needs, the speed story gets much better.

Small habits that keep the noise down: type serializers as `ModelSerializer[Project]`, and prefer `cast(User, request.user)` at boundaries over sprinkling `# type: ignore`.

## Frontend: generate everything, write nothing

### The client

There are several generators, but we settled on **[openapi-zod-client](https://github.com/astahmer/openapi-zod-client)** (with [zodios](https://www.zodios.org/)) because it produces **zod schemas**, not just types — and zod schemas do double duty (more below).

```bash
# With the backend dev server running, one command
# regenerates the whole contract surface from /api/schema/:
pnpm gen:all
# → src/schemas/backend/   zod schemas, grouped one file per OpenAPI tag
# → src/types/backend/     extracted TypeScript interfaces
# → src/services/backend/  zodios API clients
```

Useful flags: `--group-strategy tag-file` (one module per resource — this is where the ViewSet tags pay off), `--export-types` (TS interfaces alongside the zod schemas), and Handlebars templates if you need to control the output shape.

We eventually needed more than upstream offered, so we maintain an [improved fork of openapi-zod-client](https://github.com/huynguyengl99/openapi-zod-client). The main upgrades, all born from real usage:

- **Better polymorphic support** — proper discriminated unions (using zod's discriminator merging instead of intersections) and OpenAPI 3.1 `const` handling
- **Smarter grouping** — cross-file schema dependency resolution in `tag-file` mode, so shared schemas land in a common module instead of being duplicated per group
- **Template control** — separate common/shared templates, cleaner import grouping, a types-only template, and zod 4 support

The client is fully typed end to end, and zodios can validate requests/responses against the zod schemas at runtime in dev:

```typescript
const projectsApi = createApiClient(baseUrl, {
  axiosInstance: authAxios,
  validate: "request",
});

// Params, body, and response are all typed from the schema.
// Rename a field on the backend, regenerate, and this line
// turns red before you even run anything.
const project = await projectsApi.projectsRetrieve({ params: { id } });
```

### Forms that update themselves

This is my favorite part. Because the generated schemas are zod, they plug straight into form validation — and one step further, into **auto-generated forms**. Several libraries render a form directly from a zod schema (shadcn's AutoForm ecosystem and friends); we pass the generated schema to an `APIForm` component that:

- renders fields from the zod shape
- pulls defaults out of `ZodDefault` wrappers
- maps field names through i18n for labels
- takes small overrides (hide these fields, disable those) when the generic rendering isn't enough

In practice it looks like this:

```tsx
<APIForm
  schema={schemas.TaskRequest}     // generated zod schema
  onSubmit={values => tasksApi.tasksCreate(values)}
  hiddenFields={["workspace"]}     // small per-form overrides
/>
```

The result: when the backend adds a field to a serializer, the frontend form **grows the field automatically** on the next regenerate. No manually synced form definitions, no forgotten validation rules — the serializer *is* the form definition.

## The whole loop: adding one field

To make this concrete, here's everything that happens when a feature needs a new `due_date` on tasks:

1. **Model + migration** — add the field, `makemigrations`.
2. **Serializer** — add `due_date` to `fields` (plus `extra_kwargs` if it has a default). This is the *only* contract-relevant edit in the entire feature.
3. **Regenerate** — `pnpm gen:all` against the running dev server.
4. **TypeScript speaks** — the generated `TaskRequest` schema now includes `dueDate`. Any code constructing task payloads without it (if required) fails to compile, at the exact call sites.
5. **Forms update themselves** — the task form renders a date field on next reload, defaults prefilled, validation attached.
6. **The diff tells the story** — the PR shows the serializer change *and* the regenerated client files. Reviewers see the contract change explicitly; nobody needs to announce it in a meeting.

Total hand-written code: the model field and one serializer line. Everything else is derived — which is exactly why the contract can't drift.

## On learning to love types

I'll be honest about the arc, because I lived it on both sides.

I didn't like TypeScript initially. On the backend, strict mypy felt like bureaucracy. You *will* hate this setup for the first month — that's the normal part of the curve, and the fix is the boring one: read a good book, practice, push through. Somewhere along the way it flips, and then it flips hard:

- Type errors surface **before tests even run** — together with tests you get real confidence in the codebase, not vibes.
- IDE suggestions become genuinely good, which speeds up coding noticeably (even before any AI enters the picture).
- With the generated client, TypeScript is what makes contract changes *undodgeable*: the backend renames a field and the frontend build fails at the exact call sites.

Now I occasionally catch myself thanking the type checker out loud for a bug that would have been a 2 a.m. production incident.

## Why this matters for teams

For team work, I'd upgrade these three from "nice to have" to **must have**: the schema contract, the tests, and the types. Together they eliminate the *silent, unspoken change* — the most corrosive failure mode in a multi-person codebase.

Every contract change shows up in the generated files, so **git sees it and reviewers see it**. Lint and type checks fail if someone forgot to regenerate (a pre-commit hook or CI step that diffs freshly generated output catches drift automatically). Nobody has to remember to tell the frontend team — the toolchain tells them.

## Why this matters for AI-assisted development

An underrated effect: this setup makes AI coding agents dramatically more effective, using less time and fewer tokens.

When an agent works end-to-end on a feature, the schema pipeline removes the whole "update the API layer by hand" category of work — and of risk. Agents *do* sometimes mis-update one of the several places an API shape lives; here there's exactly one place (the serializer), and everything downstream regenerates. The generated typed client plus TypeScript means an agent that hallucinates an endpoint or a param gets an immediate compile error instead of a runtime surprise you have to debug later.

Contract + types is essentially machine-checkable documentation — which is exactly what agents (and new teammates) need.

## Takeaways

- Make the OpenAPI schema the **single source of truth**; generate the frontend from it, never hand-write the contract twice.
- Invest in serializer correctness — hard for weeks, second nature after, and everything downstream is free.
- Prefer structures that carry shared config (ViewSets, permission classes, tags) — the schema organization flows into your generated client.
- Zod-based generation pays twice: typed API client *and* form validation, up to fully auto-generated forms.
- Run strict type checkers on both sides; endure the initial pain, it flips.
- The pattern is stack-agnostic. Any platform works if you have the three ingredients: **an API contract, a type checker, and lint/tests wired into git.**
