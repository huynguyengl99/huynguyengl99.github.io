import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { slugifyStr } from "./slugify";

// Runs from astro.config, where `astro:content` is unavailable, so the post
// URL is derived the same way content.config.ts and getPostPaths.ts do it.
export function getPostLastmods(
  site: string,
  blogPath = "src/content/posts"
): Map<string, string> {
  const lastmods = new Map<string, string>();
  const files = readdirSync(blogPath, { recursive: true, encoding: "utf8" });

  for (const file of files) {
    const segments = file.split(/[\\/]/);
    if (!/\.mdx?$/.test(file) || segments.some(s => s.startsWith("_"))) {
      continue;
    }

    const frontmatter =
      readFileSync(join(blogPath, file), "utf8").match(
        /^---\n([\s\S]*?)\n---/
      )?.[1] ?? "";
    const field = (name: string) =>
      frontmatter.match(new RegExp(`^${name}:\\s*(\\S+)`, "m"))?.[1];
    const date = field("modDatetime") ?? field("pubDatetime");
    if (!date || field("draft") === "true") continue;

    const name = segments
      .pop()!
      .replace(/\.mdx?$/, "")
      .replace(/^\d+[-_]/, "");
    const slug = [...segments.map(slugifyStr), name].join("/");

    lastmods.set(
      new URL(`posts/${slug}/`, site).href,
      new Date(date).toISOString()
    );
  }

  return lastmods;
}
