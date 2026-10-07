---
title: "Agent Graph Engineering, Part 0: I Needed This Before It Had a Name"
description: "Years of shipping LLM features as intent detection and nested conditionals, the state machine idea that would not go away, and the library I started building and abandoned before the practice had a name. The story behind this series, and why graphs outlive the frameworks that implement them."
pubDatetime: 2026-09-19T09:00:00+07:00
tags:
  - ai-agents
  - langgraph
  - pydantic-ai
  - architecture
  - python
series: "Agent Graph Engineering"
seriesOrder: 0
---

> **TL;DR** Building a chatbot is easy. Building an AI system you can trace, test, and change without fear is not. I spent years shipping LLM features as intent detection plus nested `if/else`, and no amount of observability tooling fixed it, because the problem was that the flow only existed in code, in my head, and in a stale diagram. The fix was to stop writing the flow as control flow and start declaring it as a graph. This post is the story of how I got there, years before the practice had a name, and why I think graphs are a durable answer rather than a trend. If you only want the stack and the arguments to bring to your team, skip to [Part 1](/posts/agent-graph-engineering/the-stack-and-why-each-piece-is-there/).

Building an AI assistant today is easy. A few lines of code, an API key, and you have something that chats. Add a couple of tool definitions and you have an agent. Done, right?

Yes, for a hobby project. Production is a different animal, and the gap is wider than most people expect.

The usual first answer is observability. Drop in Langfuse, Langsmith, or Logfire and you can finally see what the model said. That helps. It also does not touch the questions that actually keep an AI system from scaling:

- How do you split work across dedicated agents, so that document handling and web research are not the same tangle of prompt instructions?
- How do you pause a tool call for human approval before something irreversible like sending an email, while letting safe calls like reading a public profile run untouched?
- How does anyone see the full picture of your agent flow? Intent routing lives in conditionals. There is no artifact to point at in a design review.
- How do you trace one user message from arrival to final answer? Observability platforms give you a list of LLM spans. Reconstructing the flow means reading code backwards or writing a script to reshape the traces into something legible.
- How does your frontend know which messages the backend can send it? When the flow changes, what stops a schema from silently going stale on one side?
- How do you stream intermediate progress in a predictable way, instead of going quiet for forty seconds and then dumping everything at once?
- How do you test any of this? Mocked responses for fast feedback, real model runs to catch regressions when you swap models or edit a prompt.
- When the agent calls the wrong tool, or two tools, or none, what do you actually look at?

If none of those have bitten you yet, you probably have a chatbot rather than a system. I know because that was me.

One thing before the story, because I would want to know. None of what follows is a composite or a hypothetical. It was a real product in the financial domain, with real users, a real team, and mistakes that were mine to make. There is a lot of generated agent writing around at the moment and I understand the reflex to skim a post hunting for the tell. Skim away. The details here are specific because they happened, and that is not something you can fake at length.

The code that goes with this series is the same story. It is distilled from a production system of five services, out of about five years spent on realtime infrastructure and agent systems, three of those on one agent product and two on another. What carries over is not the domain, which is deliberately gone, but the failure modes. The parts that look over-careful are the parts that broke somewhere else first.

## Where I was

Years ago, right around when ChatGPT landed, my team and I were building an AI product in the financial domain. I was not starting from zero: I had trained GPT-2 models, built realtime systems with Django Channels, shipped chatbots before.

The product worked. Users used it. But it was built the only way anyone knew how at the time. The term "agent" did not exist yet. We had assistants with function calls, which later became tool calls, plus prompting techniques like chain of thought and tree of thought. Our domain required us to classify what the user wanted and route to the right handler, so the core of the system was an intent classifier feeding a tree of conditionals.

We were not careless about it. We refactored, we applied every best practice we knew, and the code was reasonable by normal backend standards. But something felt wrong, and it took me a while to name it.

Here is what was actually missing:

**No system view.** Nothing showed the shape of the flow. Understanding it meant reading from entry point to exit, holding every branch in your head, and drawing it by hand in draw.io. Then someone shipped a change and the diagram was a lie.

**No end-to-end trace.** We could see individual model calls. We could not follow one user message through routing, tool calls, intermediate results, and the final answer as a single connected thing.

**No generated contract.** Our REST API had OpenAPI. Change a serializer, regenerate, the frontend knows. Our AI layer had nothing equivalent. The WebSocket message shapes lived in two hand-maintained places and drifted.

**Flaky streaming.** It worked, mostly, until it lagged or dropped in ways nobody could reproduce.

Onboarding a teammate onto that system took weeks. Debugging a production report meant a code-reading expedition. That is not a scaling problem you fix with a better logger.

## The state machine itch

At some point the shape of it clicked. Each step has a state. The model processes that state. Based on the result you transition to another state. That is a state machine, the thing I learned in university and had not thought about in years.

Once you see it that way, the conditionals look like an implementation detail of something that wants to be declared instead of written. And a declared state machine can be drawn, inspected, and traced automatically, because the structure exists as data rather than as control flow.

The framework landscape then was basically LangChain, and early LangChain was rough. If you were there, you know. Debugging through those abstractions when something went wrong was worse than debugging our own code.

So I wanted a graph library for agents: something that routes on state, that can render itself, that lets a teammate understand the system without reading a thousand lines. I started building a small package for it and gave up, because doing it properly is a lot of work and I had a product to ship.

## Finding the pieces

Time passed, the field moved, and the libraries got much better. CrewAI appeared. Pydantic AI appeared. Even LangChain grew into something genuinely useful, quite different from the version that burned me.

Pydantic AI won me over immediately. Tool calls validated by Pydantic models, typed outputs, typed dependencies, provider independence, and an API that does not fight you. It treats an agent as a thing with a declared output type and a declared set of tools, which is exactly right.

I still wanted the graph half. Then I ran into LangGraph, I think from a Reddit thread. It was the thing I had been sketching: state, nodes, conditional edges, and a flow you can export as a diagram. I went through Andrew Ng's course on it and the concepts landed fast, because I had already arrived at the same model from the other direction.

One thing bothered me. LangGraph is a LangChain-ecosystem library, and I wanted Pydantic AI for the agent layer. So I went looking for people who had combined them, and found plenty. The combination came up again and again, with strong opinions in its favor, and some teams already running it in production.

I tried it on a side project and it went better than expected. Two rough edges remained. Interrupts between Pydantic AI and LangGraph needed care. And streaming was awkward, because LangGraph only offers a generic custom-stream channel for anything outside LangChain.

The streaming problem I had already solved elsewhere. [chanx](https://github.com/huynguyengl99/chanx) is a WebSocket library I built for typed messages and generated AsyncAPI docs, and it can broadcast from anywhere in your process without threading a stream object through the call graph. Dropping it in meant a graph node deep in a subgraph could emit a progress event to the user without the graph flow knowing or caring.

LangGraph, Pydantic AI, and chanx. That is the combination I had wanted for years, and it is still the one I reach for.

## Why this outlives the frameworks

I have watched a lot of AI trends arrive and leave. Most did not feel solid. Graphs do, and I think that is because the idea is older than the hype around it. It is the same structure that shows up in build systems, dataflow engines, and state machines, applied to a new execution substrate.

The signals are lining up too. Google's ADK material now teaches [graph engineering](https://www.youtube.com/watch?v=Mzr7byMFy_4) directly. The discussion in my corner of the internet has shifted from prompt tricks toward flow structure.

The vocabulary has caught up as well. Graph engineering has guides now, a growing pile of papers, and a definition that has more or less settled: designing the graph an agentic system executes in, the nodes that do the work, the edges that route between them, and the state that travels along them. There is a distinction in that writing I wish I had had years ago. Loop engineering designs the cycle a single agent repeats until it finishes. Graph engineering designs the coordination between those cycles. Most of my pain was from trying to solve the second problem with the tools for the first.

What is still missing is production material. Nearly everything written is a tutorial: here is a state graph, here are nodes and edges, here is a two-node example that answers a question. Very little covers what happens when the graph has to live inside a real system, with a typed contract to a frontend, a person approving an action that cannot be taken back, traces you can hand someone after an incident, evals that let you change a model without crossing your fingers, and a deployment at the end of it. That gap is what this series is for.

One more thing worth clearing up, because it is the reason this is hard to search for. Put "graph" and "AI" in a search box and you mostly get knowledge graphs and graph RAG, which are retrieval techniques where a graph is the data you query. This is the execution graph of the agent itself. Graph RAG could sit behind one node here as one tool among several. Same word, unrelated concept.

## What this series is

A dozen posts, working from the stack and the reasoning down to a running system. We will build a reference implementation that is deliberately production-shaped rather than notebook-shaped: a React frontend, a Django backend that owns business data, and a separate FastAPI agent service running the graphs, talking over a typed WebSocket contract, with human-in-the-loop approvals, streaming progress, end-to-end tracing, mocked tests, and real-model evals.

[Part 1](/posts/agent-graph-engineering/the-stack-and-why-each-piece-is-there/) covers the stack and the case for each piece, which is the part you can forward to your tech lead. Everything after that is code.

The frameworks in this series will age. Some of them will be replaced, and you may end up building your own. The structural idea underneath, that your agent flow should be declared as a graph rather than written as control flow, is the part I expect to outlive the tooling.

Hope the story is useful, especially if you recognize yourself in the first half of it.

I write these deep-dives and maintain a handful of Python libraries, so if that is your kind of thing, follow along on [GitHub](https://github.com/huynguyengl99) and [LinkedIn](https://www.linkedin.com/in/huynguyengl99/).
