---
title: "Agent Graph Engineering, Part 6: Subgraphs, and a Run That Stops for a Person"
description: "Subgraphs as modules, and how a run waits for a human. What LangGraph's interrupt() buys you, the rules that come with it, and why a graph that changes every sprint is better served by putting the state somewhere you own."
ogImage: ./_images/cover-06.png
pubDatetime: 2026-10-28T07:42:00+07:00
tags:
  - ai-agents
  - langgraph
  - architecture
  - python
series: "Agent Graph Engineering"
seriesOrder: 6
---

> **TL;DR** A subgraph is a graph in its own right, with its own state and its own start and finish, that a parent mounts at one position in its own. Which of the two ways you compose it is decided by whether the schemas overlap, not by taste. For stopping to ask a person, LangGraph gives you `interrupt()`, and for a notebook or a script it is the right answer. In a product it brings rules: the node re-runs from the top, matching is index-based, and renaming a node breaks every thread already waiting. This system stops a different way. A gate ends its subgraph, the whole state goes back to the caller, and the answer arrives as a new run that routes on how far the work got. The resume becomes a router you can read, and the agent holds nothing between requests.

Everything up to here you could have worked out from the docs in an afternoon. This part is where the docs give you one answer and a system that has to keep running gives you another.

Two topics, because they are one capability. A flow large enough to need a human in it is large enough to need composing.

## Table of contents

## Subgraphs are modules

The support graph routes to three places that are themselves graphs: searching the knowledge base, running a tool, and delivering a reply. Each is compiled on its own and mounted at one position in the parent:

```python
graph.add_node("knowledge", KnowledgeGraph(self.config, self.emit).subgraph())
graph.add_node("tool", ToolGraph(self.config, self.emit).subgraph())
graph.add_node("delivery", DeliveryGraph(self.config, self.emit).subgraph())
```

The reason is the ordinary reason for modules. Each one has a job, a state of its own, and a boundary; `delivery` is reachable from three places in the parent, so the approval logic lives in it once instead of at each call site; and a team could own one without reading the others. The [LangGraph docs](https://docs.langchain.com/oss/python/langgraph/use-subgraphs) give the same three reasons, in this order: building multi-agent systems, reusing a set of nodes in more than one graph, and letting different teams work on different parts independently.

If "multi-agent" in that list surprised you, it is worth sitting with. A subgraph with its own state and its own decisions, that a parent hands control to and gets control back from, is most of what people mean by an agent in a multi-agent system. The difference from a handoff is who holds the thread. In a handoff, agent A decides agent B should take over and B owns the conversation from then on. Here the parent always gets control back, because `delivery` is a node in its graph and a node returns. You give up the ability for a subgraph to redirect the whole run, and you get a topology you can draw and a parent that is the only thing deciding what happens next.

### Which of the two ways

LangGraph also lets you call a graph from inside an ordinary node, `await other.ainvoke(...)`, with no composition involved. This is not a matter of taste, and the docs are specific:

- The schemas **share keys**, so the subgraph reads and writes the same channels as the parent: pass the compiled graph to `add_node` directly.
- The schemas **differ**, or state needs transforming between them: invoke it inside a wrapper node that maps parent state in and the result back out.

These three share keys with the parent, so they go in as nodes. The mixins in `graphs/states/` are that sharing written down, which is why the contract between a parent and a subgraph is a named thing rather than nine fields that happen to be spelled the same.

The practical difference once it is running is that a mounted subgraph is visible. It expands in the diagram, each inner node gets its own span in a trace, and the places it can stop have names. Invoked inside a node it is one box and one span, and explaining why a run did what it did means reading code.

### A parent routes after a subgraph

A subgraph cannot say where its parent goes next. [Part 4](/posts/agent-graph-engineering/the-agent-and-the-graph/) showed nodes returning `Command[Literal[...]]` to name their own destination; a subgraph has no such power, because it does not know the parent's topology. So the parent owns the transition:

```python
def route_after_tool(self, state: SupportState) -> str:
    """A method rather than a `Command`, because only a parent can route
    after a subgraph."""
    if state.tool_run is ToolRun.PENDING:
        return "__end__"
    return "support_report_tool" if state.tool else "support_respond"
```

Subgraphs are reusable *because* they are ignorant of who called them, and the price of that reuse is this.

## The whole graph, drawn from the code

This is the real export, with `xray` on. `xray` is a parameter on the compiled graph's drawing call, `get_graph(xray=True)`, and it takes a depth: truthy means expand composed subgraphs inline, falsy means draw each as a single opaque node, and an integer expands that many levels. The app serves both at `/graphs`.

```mermaid
graph TD;
    start([start])
    support_start(support_start)
    support_classify(support_classify)
    support_decide(support_decide)
    support_escalate(support_escalate)
    support_report_tool(support_report_tool)
    support_respond(support_respond)
    finish([finish])
    start --> support_start;
    knowledge_done --> support_respond;
    support_classify -.-> support_decide;
    support_decide -.-> knowledge_entry;
    support_decide -.-> support_escalate;
    support_decide -.-> support_respond;
    support_decide -.-> tool_start;
    support_escalate -.-> delivery_start;
    support_report_tool -.-> support_respond;
    support_respond -.-> finish;
    support_respond -.-> delivery_start;
    support_start -.-> support_classify;
    support_start -.-> support_decide;
    support_start -.-> tool_start;
    support_start -.-> delivery_start;
    tool_done -.-> finish;
    tool_done -.-> support_report_tool;
    tool_done -.-> support_respond;
    delivery_done --> finish;
    subgraph knowledge
    knowledge_entry(start)
    knowledge_search(knowledge_search)
    knowledge_refine(knowledge_refine)
    knowledge_done(knowledge_done)
    knowledge_entry --> knowledge_search;
    knowledge_refine -.-> knowledge_search;
    knowledge_search -.-> knowledge_done;
    knowledge_search -.-> knowledge_refine;
    end
    subgraph tool
    tool_start(tool_start)
    tool_plan(tool_plan)
    tool_gate(tool_gate)
    tool_await(tool_await)
    tool_execute(tool_execute)
    tool_done(tool_done)
    tool_start -.-> tool_plan;
    tool_start -.-> tool_execute;
    tool_start -.-> tool_done;
    tool_plan -.-> tool_gate;
    tool_plan -.-> tool_execute;
    tool_plan -.-> tool_done;
    tool_gate -.-> tool_await;
    tool_await --> tool_done;
    tool_execute --> tool_done;
    end
    subgraph delivery
    delivery_start(delivery_start)
    delivery_screen(delivery_screen)
    delivery_approval(delivery_approval)
    delivery_await(delivery_await)
    delivery_send(delivery_send)
    delivery_done(delivery_done)
    delivery_start -.-> delivery_screen;
    delivery_start -.-> delivery_send;
    delivery_start -.-> delivery_done;
    delivery_screen -.-> delivery_approval;
    delivery_screen -.-> delivery_send;
    delivery_screen -.-> delivery_done;
    delivery_approval -.-> delivery_await;
    delivery_await --> delivery_done;
    delivery_send --> delivery_done;
    end
    classDef blocking stroke-width:3px,stroke-dasharray:4 3;
    class delivery_await blocking;
    class tool_await blocking;
```

Four things to read off it. `knowledge` contains a loop, search to refine and back, which is the bounded retry further down. Each subgraph has one way in and one way out, so an early exit lands on its own finish rather than reaching past it. The two nodes with a dashed, thicker outline are the only places the run stops and waits for a person, and that marking is derived from each node's own source rather than from a list, because a hand-kept list of which nodes stop would go stale exactly here, in the picture most readers look at instead of the code.

The fourth is the one the rest of the post is about. `knowledge` runs straight into its first step, because nothing in it waits for anybody. The two that can stop, `tool` and `delivery`, enter through a node with conditional edges leaving it instead.

## Two kinds of state

The **business record** is what a person reads: the ticket, the messages, who said what. It is derived, it can be recomputed, and the backend owns it.

The **execution state** is which node runs next and what the work has got to. It is not a record of anything and nobody reads it. Its only purpose is to let a half-finished run carry on.

Those are genuinely different, and conflating them is how you end up writing a resume by hand against a half-remembered graph. The question this post is really about is where the second one lives while a person takes twenty minutes to answer.

## The obvious answer, and what comes with it

If you are building human-in-the-loop on LangGraph, you will meet `interrupt()` first. It is the documented answer, it is the first search result, and for a notebook, an internal script, or a graph that is not going to change much, it is the right call. You call it inside a node, the graph checkpoints, the call stack unwinds, and your process is free. Someone answers, you resume with a value, and the framework works out where you were. Nothing in this post makes that a bad tool.

What is worth knowing before you build a product on it is that the resume has rules, and the [docs](https://docs.langchain.com/oss/python/langgraph/interrupts) are blunt about them:

- **The node restarts from the beginning.** It does not continue from the line after `interrupt()`. Anything the node did before the interrupt runs again, so every side effect before one has to be idempotent.
- **Matching is strictly index-based.** The first `interrupt()` in a node matches the first resume value. You cannot conditionally skip one, and a `while True` loop around one replays every previous iteration.
- **You cannot wrap it in try/except,** because that swallows the exception the graph uses to unwind.
- **Values must be JSON-serializable** to work across deployments.

And the one that matters most over a product's life: adding and removing nodes and edges is safe for threads already in flight, but [renaming or removing a node is not](https://docs.langchain.com/oss/python/langgraph/backward-compatibility). Resume dispatches by the node name saved in the checkpoint. Rename `delivery_approval` and every reply currently waiting for a reviewer fails to resume.

Read those together and a shape appears. They are all the same constraint: the saved state is a position inside your code, so your code has to hold still around it. For a graph that ships once, that is free. For a graph where the business asks for a new branch every sprint, you are agreeing to a deploy checklist nobody will remember, and the failure arrives as a customer reply that never went out.

There is a second cost that is easy to miss. Graph state holds your own types, and getting them through a checkpoint means registering them with the serializer. The escape hatch when that gets tedious is `pickle_fallback`, which turns the checkpoint table into something you `pickle.loads` from. It is off by default and should stay off; it is worth knowing it is the road the serializer problem pushes you down.

## Stopping without any of that

The alternative is to end the run. A gate tells whoever is listening, marks how far the work got, and routes to a node that does nothing:

```python
async def tool_await(self, state: ToolState) -> ToolState:
    """Where the run stops while a person decides.

    It does nothing on purpose. Stopping at a node rather than inside one
    makes the stop a place with a name: drawn on the diagram, and the
    last span of the run in a trace. The wait itself is the gap to the
    run that carries on, since this one ends here.
    """
    return state
```

That empty node is doing real work. An `interrupt()` is a function call in the middle of a node: it draws nothing, and finding every place a run can stop means grepping. `tool_await` is a box with a dashed border on the picture above, and in a trace it is the run's last span, named. The wait itself is the gap to the next run, which is two timestamped runs in one tree rather than a number you have to go and compute.

The state says how far the work got, and that is all:

```python
class ToolRun(StrEnum):
    """How far a tool call has got, and the whole of how a resume routes.

    Nothing says "this run is a resume": `PENDING` means a person is holding
    it, and anything past that is their answer.
    """

    NONE = ""
    PENDING = "pending"
    APPROVED = "approved"
    CANCELLED = "cancelled"
    DONE = "done"
```

Then the entry node, which is the whole of the resume:

```python
async def tool_start(
    self, state: ToolState
) -> Command[Literal["tool_plan", "tool_execute", "tool_done"]]:
    """Where a run enters, and the whole of the resume."""
    match state.tool_run:
        case ToolRun.APPROVED:
            return Command(goto="tool_execute")
        case ToolRun.CANCELLED:
            return Command(goto="tool_done")
        case _:
            return Command(goto="tool_plan")
```

Every run enters here, first or fifth. There is no resume mode and no flag that says a run is one. A run arrives, the router reads how far the work got, and sends it where that implies. The parent does the same one level up, reading the same statuses to decide which subgraph to re-enter.

When the run ends, the whole state goes back to whoever asked:

```python
await TopicFeed(self)(
    RunEndedMessage(
        payload=RunEndedPayload(
            thread_id=self.thread_id,
            awaiting=self._awaiting(final),
            state=SupportState.model_validate(final).model_dump(mode="json"),
        )
    ),
)
```

The backend stores that against the ticket and sends it back with the decision. The agent compiles its graph with no checkpointer and forgets everything.

### What this buys

The one I would not trade is that you reason from the state rather than from the code. `pending` means somebody is holding it; `cancelled` means a person said no. You can read a thread's situation out of a JSON blob in a database, and decide from it, without opening the graph. With a checkpoint the equivalent question, where is this run and what happens if I resume it, is answered by reading the code and the framework's replay rules.

The graph can also change. Nodes can be renamed, split, reordered. A run in flight is a status and some fields, so the next version's router reads it and decides where that means now. Nothing dispatches on a node name saved last Tuesday.

The state is yours, so you can migrate it: your schema in your database. When it changes you migrate it the way you migrate anything else, or you decide a particular blob is not worth migrating and drop it. That last option matters more than it sounds, and the code takes it: the model's message history is validated when it loads, and an unreadable one is dropped with a warning rather than raised, because the same blob comes back every turn and raising would wedge that thread for good. What is lost is the shape of past tool calls; the conversation is in the record. A checkpoint cannot be dropped, because the checkpoint *is* the run.

And any process can pick it up. The state goes out and comes back, so no agent instance owns a waiting run. Deploy mid-review and nothing is lost.

### What it costs

Every decision carries the state back: a JSON blob of a couple of kilobytes on a socket that is already open. Free here, not free for a much larger state or a chattier gate.

You write the resume. It is four lines per gate, and they are four lines you have to get right.

And the sharp edge: a new question must not inherit the last run's state. Send the whole blob into a fresh turn and the second question arrives with the first one's receipt and answer already set. So the carried state is read two ways. A decision continues the run it came from and takes the state whole. A new question starts a new run and takes only what the thread is meant to remember.

## One trap worth naming

Approval is not the end of the risk, and this part applies whichever design you pick.

An irreversible tool goes through an at-most-once ledger: claim the call before making it, record the result after, and a second attempt returns the first one's result instead of calling again. The trap is the key. If it contains anything minted per attempt, every attempt gets a key of its own, no attempt ever sees the one before, and the ledger quietly does nothing. LangGraph's `checkpoint_ns` looks like a stable node path but carries a per-invocation uuid, so a key built from it whole is a new key every time:

```python
# "node:task-uuid", and the uuid is minted per invocation.
node = namespace.split(":", 1)[0]
return f"{thread}:{node}:{tool}"
```

The honest limit is worth copying too: if the process dies between claiming and recording, nobody knows whether the call went through. That is reported rather than guessed, so a person checks, because retrying risks a second refund and skipping risks none at all.

## So which should you use

If every stop in your flow lands where the graph can cleanly end, end it. Hand the state back, route from an entry node, and the thread lives in one database, the agent holds nothing, the payload is readable in a log, and the graph is free to change.

If a stop lands in the middle of work you cannot redo, `interrupt()` is what exists for that, with the caveat that it does not resume mid-node either: the node restarts and your side effects run again. The question is not really "can I afford to redo this", it is "can I write down what a resume needs". If you cannot, that is worth knowing about the design before you hand the problem to a framework, because a checkpoint does not make the complexity go away. It moves it somewhere you cannot read.

I thought `tool_gate` was the hard case: after it the tool runs, the parent writes a report, another model call drafts an answer, and delivery can stop again at a different gate. But work following a stop is not the same as a stop inside work. Everything after that gate is reachable from an entry router with the state in hand, which is what the fifteen lines above do.

## Bounds belong together, not where they loop

One more structural habit, and the only one here with nothing to do with LangGraph. A limit that constrains another limit has to be readable next to it, or nobody can check the arithmetic. That is as true of timeouts against a client deadline, or pool sizes against a connection cap, as it is of anything below.

Every limit a run is subject to lives in one file, and the reason is in its first line:

> A loop whose ceiling is written where it loops is a ceiling nobody can check against the others. These are together because they constrain each other: the recursion limit has to leave room for the worst case the retry limits allow.

Two of them, with their arithmetic:

```python
# One retry. A second empty result means the article does not exist, and looping
# on a model's guesses is how a miss turns into a bill.
KB_MAX_ATTEMPTS = 2

# Super-steps for a whole run, subgraphs included. The longest path is
# classify -> decide -> knowledge (search, evaluate, refine per attempt) ->
# respond -> delivery (screen, gate, send), which is well under this; the margin
# is for a parent that gains a branch without anyone revisiting this file.
GRAPH_RECURSION_LIMIT = 150
```

A graph with subgraphs and retries has a worst-case path length that is not obvious from any one file. Scatter the ceilings and nobody can tell whether the global one leaves room for the local ones, so the first symptom is a legitimate long run hitting the recursion limit and looking like an infinite loop.

## Accept, edit, or reject

Three outcomes at a gate, and the middle one is the one that matters.

![The same gate with the amount edited to 9, the button now reading Run with my corrections](./_images/corrected.png)

A reviewer can change the draft, or the tool's arguments, on the way through, and the resumed run does what the human wrote: correcting £29 to £9 means £9 is what gets refunded. This is the feature that makes an approval gate tolerable. Without it, a reviewer with a small objection has to reject, which discards the work, which means they stop using the gate and start doing the job by hand.

It needs one thing said out loud to the model afterwards. A live run answered a corrected £9 refund by telling the rep to refund the missing £20, which is the reviewer's decision being undone by the summary of it. So the state carries whether the arguments were changed, and the prompt says that is the decision rather than a mistake.

Rejection is recorded as an outcome rather than silently dropping everything, and a rejected draft is never written to the ticket log, so a reply the customer never saw leaves no trace suggesting they did.

## What else it costs

Subgraph boundaries are a commitment. Moving a node across one changes what merges when, so splitting a subgraph later is not a refactor you do casually.

One run at a time per lane, and that took a bug to learn. One state blob is kept per ticket and audience, so two runs in one lane are two graphs writing one thread and the second wins. A reply waiting at the gate could be lost when a later message started another run and replaced the state behind it. A run now claims its lane and holds the claim *through* a stop, because waiting for a person is not the same as being finished.

Debugging a stopped run is still harder than debugging one that ran straight through. The difference is that the state is JSON somebody can read, in a table somebody can query. The trace is what saves you either way, which is post 9.

Next up is the realtime half: why the backend talks to the agent over a WebSocket rather than a queue, and how a node buried in a subgraph streams progress to a browser without the graph knowing anything about sockets.

Hope this one is useful. If you have shipped a human-in-the-loop gate and landed somewhere different, I would read that gladly, and if you have tips of your own on where to keep a half-finished run, pass them on.

I write these deep-dives and maintain a handful of Python libraries, so if that is your kind of thing, follow along on [GitHub](https://github.com/huynguyengl99) and [LinkedIn](https://www.linkedin.com/in/huynguyengl99/).
