# Series covers

One 2400x1350 cover per post in the Agent Graph Engineering series. They are the
post's `ogImage`, so they are what Twitter, LinkedIn and Slack show, and they are
the cover image HackerNoon asks for on syndication.

Each cover is a plain HTML page sharing `cover.css`, rendered headlessly:

```bash
npx -y playwright@latest install chromium   # once
node scripts/covers/render.mjs              # all of them
node scripts/covers/render.mjs 01           # just part 1
```

Output goes to `src/content/posts/agent-graph-engineering/_images/cover-NN.png`,
and the post points at it with `ogImage: ./_images/cover-NN.png`.

## Adding one

Copy `part-01.html`, change the eyebrow, title and kicker, and give the right
half something that carries the post's own idea. Two panel styles exist already:
a table of rows (`.row` / `.layer` / `.choice`, used by Part 1) and a
before-and-after (`.stage` / `.code` / `.nodes`, used by Part 0). A cover that
only repeats the title is not worth making, so if the right half has nothing to
say, the post probably wants a screenshot instead.

Keep the title under about 45 characters per line. Nothing clips automatically.
