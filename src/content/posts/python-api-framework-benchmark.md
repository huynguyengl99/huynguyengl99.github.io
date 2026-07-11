---
title: "Python API Framework Benchmark: FastAPI vs Django vs Litestar on Real Database Workloads"
description: "I benchmarked the major Python web frameworks against real PostgreSQL workloads. The 20x performance gap you see in JSON benchmarks collapses to 1.3x once the database gets involved."
pubDatetime: 2026-07-11T12:00:00+07:00
featured: true
tags:
  - python
  - django
  - fastapi
  - performance
  - benchmark
---

Framework benchmarks usually measure one thing: how fast a framework can serialize JSON. That's a fine number, but it's not what most of us ship. Most real APIs spend their time talking to a database.

So I benchmarked the major Python frameworks with real PostgreSQL workloads — complex queries, nested relationships, and properly optimized eager loading for each framework (`select_related`/`prefetch_related` for Django, `selectinload` for SQLAlchemy). Every framework was tested with multiple production servers in isolated Docker containers with strict resource limits.

All queries follow each framework's best practices. This is a comparison of properly written production code, not naive implementations.

**TL;DR:** Performance differences collapse from **20x** (plain JSON) to **1.7x** (paginated queries) to **1.3x** (complex detail queries). Database I/O is the great equalizer — framework choice barely matters for database-heavy apps.

Full results, code, and a reproducible Docker setup: [python-api-frameworks-benchmark](https://github.com/huynguyengl99/python-api-frameworks-benchmark)

## Table of contents

## What was tested

**Frameworks and servers:**

- Django Bolt (runbolt server)
- FastAPI (uvicorn, granian)
- Litestar (uvicorn, granian)
- Django REST Framework (uvicorn, granian, gunicorn + gevent)
- Django Ninja (uvicorn, granian)

**Setup:**

- Hardware: MacBook M2 Pro, 32GB RAM
- Database: PostgreSQL with realistic data (500 articles, 2,000 comments, 100 tags, 50 authors)
- Isolation: each framework in its own Docker container — 500MB RAM limit, 1 CPU core, run sequentially so nothing competes for resources
- Load: 100 concurrent connections, 10s duration, best of 3 runs

**Endpoints:**

| Endpoint                          | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `/json-1k`                        | ~1KB JSON response                                 |
| `/json-10k`                       | ~10KB JSON response                                |
| `/db`                             | 10 simple database reads                           |
| `/articles?page=1&page_size=20`   | Paginated articles with nested author + tags       |
| `/articles/1`                     | Single article with nested author + tags + comments |

## Results

### 1. Simple JSON (`/json-1k`)

A 20x difference between fastest and slowest — this is the number most benchmarks stop at.

| Framework        | RPS    | Latency (avg) |
| ---------------- | ------ | ------------- |
| litestar-uvicorn | 31,745 | 0.00ms        |
| litestar-granian | 22,523 | 0.00ms        |
| bolt             | 22,289 | 0.00ms        |
| fastapi-uvicorn  | 12,838 | 0.01ms        |
| fastapi-granian  | 8,695  | 0.01ms        |
| drf-gunicorn     | 4,271  | 0.02ms        |
| drf-granian      | 4,056  | 0.02ms        |
| ninja-granian    | 2,403  | 0.04ms        |
| ninja-uvicorn    | 2,267  | 0.04ms        |
| drf-uvicorn      | 1,582  | 0.06ms        |

### 2. Paginated articles (`/articles?page=1&page_size=20`)

Add a real database query with nested relations and the gap shrinks to **1.7x**. Query optimization is now the bottleneck.

| Framework        | RPS | Latency (avg) |
| ---------------- | --- | ------------- |
| litestar-uvicorn | 253 | 0.39ms        |
| litestar-granian | 238 | 0.41ms        |
| bolt             | 237 | 0.42ms        |
| fastapi-uvicorn  | 225 | 0.44ms        |
| drf-granian      | 221 | 0.44ms        |
| fastapi-granian  | 218 | 0.45ms        |
| drf-uvicorn      | 178 | 0.54ms        |
| drf-gunicorn     | 146 | 0.66ms        |
| ninja-uvicorn    | 146 | 0.66ms        |
| ninja-granian    | 142 | 0.68ms        |

### 3. Article detail (`/articles/1`)

Single article with all nested data (author + tags + comments): the gap narrows to **1.3x**. The frameworks are nearly indistinguishable.

| Framework        | RPS | Latency (avg) |
| ---------------- | --- | ------------- |
| fastapi-uvicorn  | 550 | 0.18ms        |
| litestar-granian | 543 | 0.18ms        |
| litestar-uvicorn | 519 | 0.19ms        |
| bolt             | 487 | 0.21ms        |
| fastapi-granian  | 480 | 0.21ms        |
| drf-granian      | 367 | 0.27ms        |
| ninja-uvicorn    | 346 | 0.28ms        |
| ninja-granian    | 332 | 0.30ms        |
| drf-uvicorn      | 285 | 0.35ms        |
| drf-gunicorn     | 200 | 0.49ms        |

### Complete summary

| Framework        | JSON 1k | JSON 10k | DB (10 reads) | Paginated | Article Detail |
| ---------------- | ------- | -------- | ------------- | --------- | -------------- |
| litestar-uvicorn | 31,745  | 24,503   | 1,032         | 253       | 519            |
| litestar-granian | 22,523  | 17,827   | 1,184         | 238       | 543            |
| bolt             | 22,289  | 18,923   | 2,000         | 237       | 487            |
| fastapi-uvicorn  | 12,838  | 2,383    | 1,105         | 225       | 550            |
| fastapi-granian  | 8,695   | 2,039    | 1,051         | 218       | 480            |
| drf-granian      | 4,056   | 2,817    | 972           | 221       | 367            |
| drf-gunicorn     | 4,271   | 3,423    | 298           | 146       | 200            |
| ninja-uvicorn    | 2,267   | 2,084    | 890           | 146       | 346            |
| ninja-granian    | 2,403   | 2,085    | 831           | 142       | 332            |
| drf-uvicorn      | 1,582   | 1,440    | 642           | 178       | 285            |

## Resource usage

**Memory:** most frameworks sat at 170–220MB. The outlier was DRF on Granian's WSGI mode at 640–670MB — a difference in protocol handling (WSGI vs ASGI), not a performance problem.

**CPU:** most frameworks saturated the 1-core limit under load; the Granian variants consistently maxed out CPU across all frameworks.

## Server notes

- **Uvicorn** surprisingly won for Litestar (31,745 RPS), beating Granian
- **Granian** delivered consistently high performance for FastAPI and others
- **Gunicorn + gevent** held up fine for DRF on simple queries but struggled once database workloads got heavier

## Takeaways

1. **The performance gap collapses**: 20x on JSON serialization → 1.7x on paginated queries → 1.3x on complex queries.
2. **Litestar dominates simple workloads**, but FastAPI actually wins the complex detail query. At that point they're all within noise of each other.
3. **Database I/O is the equalizer.** Once you hit the database, framework overhead becomes negligible. Query optimization matters infinitely more than framework choice.

**Bottom line:** if you're building a database-heavy API — which most of us are — spend your time optimizing queries, not agonizing over frameworks. Properly optimized, they all perform nearly identically. (And if you want help *finding* those unoptimized queries in Django, that's exactly what my [nplus1](https://github.com/huynguyengl99/nplus1) package is for.)

Everything is reproducible: [github.com/huynguyengl99/python-api-frameworks-benchmark](https://github.com/huynguyengl99/python-api-frameworks-benchmark). Feedback and PRs welcome.
