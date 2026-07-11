---
title: "nplus1: A Modern N+1 Query Detector for Django, SQLAlchemy, and Peewee"
description: "A maintained, improved successor to nplusone — no more false positives on nullable foreign keys, stack traces in every detection, batch reporting, and full strict typing."
pubDatetime: 2026-05-14T10:00:00+07:00
tags:
  - python
  - django
  - performance
  - open-source
---

The original [nplusone](https://github.com/jmcarp/nplusone) has been unmaintained for around 8 years. I used it for a long time — and although it was helpful, I kept hitting false positives that forced me to whitelist half my codebase, and I wanted nicer trace messages (inspired by django-zeal). So I decided to maintain and improve it: **[nplus1](https://github.com/huynguyengl99/nplus1)**.

## Table of contents

## What's new or fixed

- **Python 3.11+, full type hints** — mypy strict + pyright strict
- **Django 4.2–5.2 and SQLAlchemy 2.0** support
- **No more false positives on nullable foreign keys** — those are valid optimizations and are now skipped
- **Proper handling of multi-table inheritance and polymorphic models** via PK-based cross-model matching
- **Stack trace with the registration site in every detection message** — you know exactly where the offending query was set up
- **Batch reporting mode** — collect all detections and report once at the end of a request
- **Skips checks on 4xx/5xx responses** by default (configurable)
- **`NPLUSONE_ENABLED = False`** switch for zero overhead in prod
- **Celery support** out of the box, plus a debug mode that logs every signal during a request

It catches almost all N+1 issues — and also **redundant `prefetch_related` and `select_related` calls**, which most tools ignore. I've been running it against a real project with complex patterns like polymorphic models, and it holds up well.

## One important caveat

Use it in **dev and test environments only**. The package works via middleware and monkey-patching the ORM, so it's not meant for production — that's what Sentry or Datadog are for. The `NPLUSONE_ENABLED` flag makes it a no-op in prod so you can keep a single config.

For SQLAlchemy and Peewee, I ported the original logic and the test suites pass, but I haven't battle-tested those ORMs in a real project yet — feedback very welcome.

## Why query optimization matters more than you think

If you saw my [framework benchmark](/posts/python-api-framework-benchmark/), you know the punchline: once real database queries enter the picture, framework performance differences nearly vanish — query efficiency is what actually moves the needle. Finding and killing N+1 queries is the highest-leverage performance work most Django apps can do.

## Links

- GitHub: [huynguyengl99/nplus1](https://github.com/huynguyengl99/nplus1)
- PyPI: [nplus1](https://pypi.org/project/nplus1/)

Hope you find it useful.
