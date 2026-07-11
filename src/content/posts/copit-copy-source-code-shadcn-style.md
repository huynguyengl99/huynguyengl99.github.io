---
title: "copit: Copy Source Code Into Your Project, shadcn/ui Style"
description: "A CLI that copies source code from GitHub repos, URLs, and ZIP archives directly into your project — tracked, updatable, and fully yours. A Rust binary installable via pip."
pubDatetime: 2026-03-10T10:00:00+07:00
tags:
  - python
  - rust
  - tooling
  - open-source
---

Sometimes you find useful code on GitHub — a single module, a well-written parser, a utility — and your options are bad: copy-paste it manually and lose track of where it came from, or install the entire library as a dependency just for one piece of it. Other times you *want* a library but can't have it: version conflicts, or it's unmaintained but the code is still perfectly good.

**[copit](https://github.com/huynguyengl99/copit)** solves this the way [shadcn/ui](https://ui.shadcn.com/) did for React components: instead of an opaque package, you get the actual source files. You own them, you can read and modify them, no dependency lock-in — but unlike manual vendoring, everything stays tracked and updatable.

## Table of contents

## How it works

```bash
pip install copit

copit init                          # creates copit.toml
copit add github:owner/repo@v1.0/path/to/component
copit update vendor/component       # re-fetch latest
copit sync                          # re-fetch all tracked sources
copit remove vendor/component       # clean up
```

Everything is tracked in `copit.toml`. You can mark files you've modified so they won't get clobbered on update, and a `--backup` flag saves `.orig` copies when your files differ from upstream.

## Versus the alternatives

- **Manual copy-paste / git clone** — works once, but you lose provenance and can't pull updates. copit tracks source, version, and lets you sync.
- **Git submodules** — pulls in the entire repo. copit grabs specific files or directories. Also, submodules are submodules.
- **pip install + forking/monkey-patching** — you depend on the whole package and fight the parts you don't control.
- **Custom vendoring scripts** — everyone writes them differently. copit is one consistent workflow.

## The bigger idea

The pattern I'm most excited about: distributing **framework components as copyable source**. Think of how a LangChain-style project could work — the core orchestration ships as a pip package, but integrations (provider adapters, custom chains) are source files users copy in and own. They read exactly what the code does, modify what doesn't fit, and never wait on an upstream PR.

## A note on Rust

copit is a Rust binary distributed via maturin, so `pip install copit` gives you a native binary with no toolchain needed (it's also on [crates.io](https://crates.io/crates/copit)). I'm primarily a Python developer — this was my first Rust project, chosen for the single-binary distribution story, and a great learning exercise in ownership, `anyhow` error handling, and structuring a real project with tests.

## Links

- GitHub: [huynguyengl99/copit](https://github.com/huynguyengl99/copit)
- Docs: [huynguyengl99.github.io/copit](https://huynguyengl99.github.io/copit)
- PyPI: [copit](https://pypi.org/project/copit/) · crates.io: [copit](https://crates.io/crates/copit)

Feedback, issues, and contributions are welcome.
