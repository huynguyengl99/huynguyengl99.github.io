---
title: "DRF Auth Kit: A Complete Authentication Solution for Django REST Framework"
description: "Modern DRF authentication with JWT cookies, 50+ social login providers, MFA, full type safety, and OpenAPI schemas that are actually correct — no manual fixes required."
pubDatetime: 2025-12-08T10:00:00+07:00
tags:
  - python
  - django
  - drf
  - authentication
  - open-source
---

If you've built authentication for a Django REST Framework API, you've probably used dj-rest-auth or django-trench. I did too — and loved them — but they've accumulated pain points that never got addressed: broken or incomplete OpenAPI schemas, missing type hints, and customization that fights you.

**[DRF Auth Kit](https://github.com/forthecraft/drf-auth-kit)** is my answer: a comprehensive authentication package designed around the things modern API teams actually need.

## Table of contents

## What's in the box

- **Modern, secure authentication** — read-only JWT cookie auth by default, with DRF Token and custom auth methods also supported
- **Full user authentication flow** — sign up, sign in, email verification, password reset, password change, with easy customization of views and serializers
- **Social & OAuth2 login** — 50+ providers (Google, GitHub, and more) via django-allauth
- **Multi-factor authentication** — email, authenticator apps, and backup codes, with pluggable handlers
- **Full typing support** — pyright and mypy compatible, end to end
- **Accurate OpenAPI schemas** — ideal for schema-to-code tools on the frontend; no manual schema patching
- **Internationalization** — 57+ languages out of the box
- **Broad Django support** — 4.2 through 6.0

```bash
pip install "drf-auth-kit[all]"  # includes MFA and social authentication
```

## Why another auth package?

The differentiator is the combination of **correct OpenAPI schemas + end-to-end type safety**. If your frontend generates API clients from your schema, broken auth schemas poison the whole pipeline — you end up hand-patching generated code or maintaining manual overrides. DRF Auth Kit's schemas are complete and correct out of the box, so schema-to-code just works.

It's a good fit if you are:

- a team that needs reliable, accurate API documentation
- a project that requires type-safe authentication
- a developer tired of patching broken auth schemas by hand

## Migrating from dj-rest-auth

Both packages build on the same underlying libraries (django-allauth, djangorestframework-simplejwt), so migration is straightforward — I wrote a dedicated [migration guide](https://drf-auth-kit.readthedocs.io/en/latest/user-guides/migration-from-dj-rest-auth.html) covering the mapping step by step.

## Links

- GitHub: [forthecraft/drf-auth-kit](https://github.com/forthecraft/drf-auth-kit)
- Docs: [drf-auth-kit.readthedocs.io](https://drf-auth-kit.readthedocs.io/)
- PyPI: [drf-auth-kit](https://pypi.org/project/drf-auth-kit/)

Feedback and contributions welcome.
