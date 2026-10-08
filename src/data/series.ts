/**
 * Facts about a series that cannot be derived from its posts.
 *
 * Two things live here. Whether a series is still running, because a page
 * listing two parts reads as a finished series of two unless it says
 * otherwise. And the planned outline, because the posts themselves can only
 * describe what is already published, and the point of showing a map is to
 * show what is coming.
 *
 * Keyed by the `series` value in post frontmatter. Editing the plan means
 * editing this file, and every place that renders the map follows. Nothing is
 * restated in prose inside a post, which is what used to rot.
 */
export type SeriesPart = {
  /** Planned title. Once the post exists its real title is used instead. */
  title: string;
  /** Slug it will publish at. Links as soon as that post is live. */
  slug: string;
};

export type SeriesInfo = {
  /** Still being written, so pages invite a reader back. */
  ongoing?: boolean;
  /** The plan, published or not, in reading order. */
  outline?: SeriesPart[];
};

export const SERIES_INFO: Record<string, SeriesInfo> = {
  "Agent Graph Engineering": {
    ongoing: true,
    outline: [
      { title: "I needed this before it had a name", slug: "before-it-had-a-name" },
      { title: "The stack, and why each piece is there", slug: "the-stack-and-why-each-piece-is-there" },
      { title: "Split the services: where the line goes between your product and your agent", slug: "split-the-services" },
      { title: "Contracts, not conventions: how two codebases stay in step", slug: "contracts-not-conventions" },
      { title: "The agent and the graph: a typed model call, and the flow that routes it", slug: "the-agent-and-the-graph" },
      { title: "Tools and guardrails: what the model may do, and what it may say", slug: "tools-and-guardrails" },
      { title: "Subgraphs, persistence, and interrupts: how a run pauses for a human", slug: "subgraphs-persistence-interrupts" },
      { title: "Why a WebSocket, and how progress streams from anywhere in the graph", slug: "why-a-websocket" },
      { title: "Practices for both sides: the business service and the agent service", slug: "practices-for-both-services" },
      { title: "Observability: tracing a run, seeing the graph, and what it cost", slug: "tracing-a-run" },
      { title: "Testing and evals: changing a model or a prompt without fear", slug: "testing-and-evals" },
      { title: "Shipping it: containers, config, and the steps you still owe", slug: "shipping-it" },
    ],
  },
};

export const seriesInfo = (name: string): SeriesInfo => SERIES_INFO[name] ?? {};
