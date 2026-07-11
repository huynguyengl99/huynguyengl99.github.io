# huynguyengl99.github.io

My personal blog, built with [Astro](https://astro.build/) and the [AstroPaper](https://github.com/satnaing/astro-paper) theme. Deployed to GitHub Pages via GitHub Actions.

## Development

```bash
pnpm install
pnpm dev      # local dev server at localhost:4321
pnpm build    # production build + pagefind search index
pnpm preview  # preview the production build
```

## Writing posts

Add markdown/MDX files to `src/content/posts/`. Frontmatter schema is defined in `src/content.config.ts`. Site-wide settings live in `astro-paper.config.ts`.
