---
title: "Agent Graph Engineering, Part 2: Split the Services, and Know Where the Line Goes"
description: "Why the agent graph and the business logic belong in dedicated services, how to draw the line at state ownership rather than at layers, why a node you can call beats a decision you have to reach through a socket, and the bug that taught me the thread a person reads and the thread a model remembers are not the same object."
ogImage: ./_images/cover-02.png
pubDatetime: 2026-10-12T09:00:00+07:00
tags:
  - ai-agents
  - langgraph
  - architecture
  - python
  - django
series: "Agent Graph Engineering"
seriesOrder: 2
---

> **TL;DR** Put your product's domain in one service and your agent graph in another, and draw the line at state ownership rather than at anything that sounds like a layer. The agent owns execution state, which is a LangGraph checkpoint nobody can rebuild by hand. The backend owns the record, which is what a page reload needs. Updates travel one way, agent to backend, over a generated WebSocket client. The payoff is not tidiness, it is that a node is a function you can call with a state you invented, while the same decision inside a socket consumer needs a connection and a user before it will run at all. The part I got wrong the first time: the thread a person reads and the thread a model remembers are two different objects, and trying to store them as one leaves you with two copies that can disagree.

[Part 1](/posts/agent-graph-engineering/the-stack-and-why-each-piece-is-there/) listed the stack and said, in one line, to keep business logic out of the agent. That line does a lot of work and deserves its own post, because it is the decision that is nearly free this month and expensive in a year, and because "split it into two services" is useless advice until somebody tells you where the cut goes.

## What the merged version looks like

I have shipped the single-service version. It does not fail dramatically. It degrades, in a way that is hard to argue with in a code review because every individual step was reasonable.

It goes something like this. Your agent needs to know whether a customer is on the paid plan, so the prompt grows a line about entitlements. Then billing adds an annual tier, and now the prompt is wrong in a way no test catches, because the prompt is a string and nothing validates strings against your billing model. Meanwhile a graph node needs the ticket's history, so it reads the ORM directly, and now your graph cannot run in a test without a database and fixtures. Six months later somebody asks whether the agent can be deployed separately, because the model calls are slow and the web workers are blocked waiting on them, and the answer is no, not without unpicking all of it.

The two failure directions are worth naming separately, because they feel different while you are in them. Business rules leak into prompts, where they cannot be type-checked or unit-tested. Graph concerns leak into models, where a `tickets` table starts carrying columns about node execution. Neither side can be tested alone by then, which is the point at which the split stops being a refactor and becomes a rewrite.

## The test you cannot write

That last sentence is the one that matters, so here is what it looks like from inside.

In the merged version the agent's decision happens inside the socket consumer, in a method that has already authenticated the user, loaded the conversation and written a row. To assert that a particular message routes to a particular capability, you have to arrive at that line the way a user does: open a connection, authenticate it, seed a session and a conversation, and let the whole thing run until the part you care about executes. The assertion is one line. Everything above it is travel.

The mocks are worse than the setup. Because the model is reached through that object rather than across a boundary, there is no single place to stub it. You stub each collaborator where it happens to be used, so the fakes multiply with the call graph instead of with the number of seams. A suite like that gains patches faster than it gains assertions, and past a certain density nobody can tell you which parts are still being exercised and which are being asserted against a mock of themselves.

A graph node does not have that problem, and not because graphs are virtuous. It is because a node is a function from state to state. You build the state you want, call it, and look at what came back.

```python
async def test_knowledge_base_branch_grounds_the_answer() -> None:
    thread = "kb-branch"
    with mock_openai(CLASSIFY, SEARCH_KB, ANSWER_FROM_KB) as route:
        state = (
            await SupportGraph()
            .compile(checkpointer())
            .ainvoke({"context": ticket()}, config=config(thread))
        )

    assert route.call_count == 3
    assert isinstance(state["decision"], SearchKnowledgeBase)
    # The retrieval step ran and fed the answer agent.
    assert state["kb_snippets"]
    assert any("kb-002" in snippet for snippet in state["kb_snippets"])
```

That is the whole test, not an excerpt. The three capitalized names are canned model replies declared at the top of the file. There is no socket to open and nobody to log in, because the node never needed either. The only thing faked is the model's HTTP response, which is the one real boundary in the picture, and everything underneath it runs: three model calls, a retrieval step, a routing decision, and an answer that had to cite what retrieval handed back.

So the argument for splitting is narrower and more useful than "separation of concerns". It was never about tidiness. It was about being able to call the thing.

## The cut is about state, not layers

The instinct is to split by technology or by layer. API service, agent service, maybe a worker. That produces a diagram your architect likes and a boundary that leaks within a month, because layers are not what is actually different about these two things.

What is actually different is the kind of state each one holds.

The agent owns execution state: which node runs next, the current channel values, the payload of a pending interrupt. In LangGraph that is a checkpoint, and it lives in Postgres. The important property is that you cannot rebuild it by hand. If you lose a checkpoint, you have not lost a row you could recompute from other rows. You have lost the ability to resume, because reconstructing it means reimplementing LangGraph's execution model, and you are not going to do that. Resumption is the whole mechanism behind human approval, so this state is load-bearing in a way ordinary application state is not.

The backend owns the record: messages, ticket events, and the two things a page reload needs to find, which are a drafted reply waiting for approval and a proposed tool call. None of those are copies of graph state. They exist because a browser cannot ask the agent what is currently waiting, and because a stored approval row is what lets the approval card come back after a refresh.

Once the line is drawn there, a lot of smaller questions answer themselves. Permissions, billing, and user records are obviously the backend's, because they are the record. Prompts, tools, and routing are obviously the agent's, because they are execution. The service the agent exposes has one job, and the service your product lives in never imports LangGraph.

In the reference implementation it comes out as three processes:

| Service    | Owns                                            | Port |
| ---------- | ----------------------------------------------- | ---- |
| `backend/` | users, tickets, the thread as a person reads it | 8000 |
| `agent/`   | graphs, tools, checkpoints, the model's memory  | 8001 |
| `web/`     | nothing; it renders what the other two generate | 5173 |

The agent is internal. Only the backend connects to it, never a browser, and that matters more than it looks. The approval gate lives inside the graph, so anything that can open a socket on the agent can both propose a tool call and approve it. Network isolation is the primary control there and a shared token is the second one, which is why the token is optional in a fresh clone and not optional anywhere real.

## The bug: two threads, not one

I got this wrong the first time, and the symptom was confusing enough to be worth the detail.

There are two conversation histories in a system like this, and they are not the same object.

One is the thread as a person reads it: an ordered list of events you can render, paginate, and show to a customer. That is rows, and it belongs to the backend.

The other is the thread as the model remembers it, which in Pydantic AI is its own message history. That is not a list of rows. It carries tool calls and their results, the shapes of previous structured outputs, and the sequencing the model needs to behave consistently on the next turn. Flattening it into "a list of messages" throws away exactly the parts that make the next call work.

In a long-running thread there is a third, and naming it separately is what stopped me conflating the first two. Beyond what the model carries into this call, there is what it can find from calls long past, which is a retrieval problem rather than a memory one: older turns chunked and embedded so the relevant ones can come back when they matter. Render it, carry it, search it. Three jobs, and storing any one of them as a copy of another makes you responsible forever for keeping them equal.

I first gave that model memory its own table, filled by a background job once the message itself had been saved. Two copies of one thread, written by two processes at two different times, which is the shape of a problem whether or not you have hit it yet. The gap between those writes is not a rare crash window either, which is what I had told myself. It is ordinary operation: the job queues, it retries, occasionally it does not arrive, and the write that already succeeded neither knows nor cares. When the two disagreed, neither had been derived from the other, so neither could be rebuilt. There was no correct recovery, only a choice about which copy to believe.

The fix was to stop treating it as a second source of truth. The model's memory now rides on the graph's state, so the checkpointer that already persists a parked run persists the memory too. One write, one thing to lose. And when a lane has nothing remembered yet, it starts from the record the backend sends, which quietly turns the memory into a cache over the record rather than a peer of it. Lose a checkpoint now and what you lose is the shape of past tool calls, not the conversation.

That is the test I would apply to any state you are tempted to put on the agent side. If losing it means losing data, it belongs in the record. If losing it only means losing speed or fidelity, the agent can keep it.

## Updates travel one way

Neither service mirrors the other, and only one direction carries updates.

A graph node broadcasts an event on its topic. The backend is subscribed, and its relay does two things with each event: writes down whatever belongs in the record, and fans the event out to the browser group. So the backend learns what happened by being told. It never reads the agent's tables, and the agent never writes to the backend's.

The useful consequence is that the record is derived, which means it can lag but it cannot diverge. A terminal event persists the turn. A parked run persists the approval card. A tool proposal is deliberately not persisted as a turn, because it only becomes one if it actually runs.

The place this shows up as real code is a small protocol on the backend describing everything the agent can announce:

```python
class Sink:
    """Where a run's events are written down. Every hook is optional."""

    async def classified(self, category: str, priority: str, why: str) -> None: ...
    async def decided(self, decision: str, why: str) -> None: ...
    async def drafted(self, content: str, model: str) -> None: ...
    async def approval_required(self, draft: str, findings: list[str]) -> None: ...
    async def reply_sent(self, content: str) -> None: ...
    async def token(self, delta: str) -> None: ...
    async def tool_proposed(self, payload: Any) -> None: ...
    async def tool_ran(self, payload: Any) -> None: ...
    async def failed(self, message: str) -> None: ...
```

That interface is the boundary, written down. Three different callers open connections to the agent in this app: a ticket's customer-facing run, the same ticket's internal team run, and a standalone conversation. They turned out to differ only in what they wrote down, never in how they talked to the agent, so the talking lives in one place and the writing-down is whichever `Sink` you hand it. Every hook being optional is the bit that makes that work: a caller that does not care about token deltas simply does not implement `token`.

A boundary you can read in twenty lines is also a boundary you can test. Pass a recording `Sink`, drive the relay, and assert on what it would have written, with no database and no model.

## The boundary is generated, not hand-written

Two services talking means a contract, and a hand-maintained contract between two codebases is a slow leak. I have watched a WebSocket message shape drift between a backend and a frontend that each believed they were right, and there is no satisfying way to debug it, because both sides are internally consistent.

So nothing here is hand-written. The agent's consumers produce an AsyncAPI document, and a generated Python client is what the backend imports:

```python
from helpdesk.agent_client.agent_hub_support_topic.client import (
    AgentHubSupportTopicClient,
)
from helpdesk.agent_client.agent_hub_support_topic.messages import (
    ApprovalRequiredMessage,
    ReplySentMessage,
    RunRequestMessage,
    ToolApprovalMessage,
)
```

Change a message on the agent, regenerate, and the backend stops type-checking. That is the entire mechanism, and it is the same trick your REST API has had through OpenAPI for a decade. The next post covers how the generation works and what drift actually costs. For now the only claim is that the seam between two services is the last place you want a shape that exists only in two people's heads.

## What it costs

Two services is more than one service, and I would rather say the costs out loud than discover them in your comments.

You now run two processes locally, with two sets of environment variables and a shared token that has to match in both. The repo hides that behind a single setup command, but somebody wrote that command.

You have a network hop on the critical path. For this workload it disappears into model latency, which is measured in seconds, so a few milliseconds of local socket is noise. If your agent were doing something fast and chatty, the calculus would change.

You have a contract to regenerate. It is one command, but it is a step, and forgetting it produces a confusing failure until you learn the shape of it.

And you have two deploys, two sets of logs, and two things that can be down independently. Tracing across the boundary stops being free, which is a large part of why observability gets a post of its own rather than a paragraph.

## When not to do this

I do not think this is unconditional. If you are building a prototype to find out whether an idea works, one service is correct, and splitting early is the kind of discipline that feels responsible while slowing you down for no return. The same goes for a tool with one user, which is you.

The signals that it is time: the model calls are slow enough that they are blocking your web workers; you want to scale the agent independently, or on different hardware; more than one person is working on the system and the prompts and the business rules are colliding in review; or you have started writing graph concepts into your application tables.

The reason to do it before you are forced to is simply that the cost curve is steep. Drawing the line while there is nothing across it is an afternoon. Drawing it after a year of leaks is the rewrite that gets postponed every quarter, and that one never gets cheaper.

Next up is types and contracts, which is the other idea the rest of the series leans on and the thing that makes this boundary enforceable rather than aspirational. Hope this one is useful if you are staring at a single service and wondering whether to cut it.

I write these deep-dives and maintain a handful of Python libraries, so if that is your kind of thing, follow along on [GitHub](https://github.com/huynguyengl99) and [LinkedIn](https://www.linkedin.com/in/huynguyengl99/).
