import type { CollectionEntry } from "astro:content";
import { postFilter } from "./postFilter";
import { slugifyStr } from "./slugify";

type Series = {
  series: string;
  seriesName: string;
  parts: CollectionEntry<"posts">[];
};

/** Published posts in a series, ordered by `seriesOrder`. */
export function getSeriesParts(
  posts: CollectionEntry<"posts">[],
  seriesName: string
): CollectionEntry<"posts">[] {
  return posts
    .filter(postFilter)
    .filter(post => post.data.series === seriesName)
    .sort((a, b) => (a.data.seriesOrder ?? 0) - (b.data.seriesOrder ?? 0));
}

/**
 * Every series that has at least one published post, with its parts in order.
 *
 * Mirrors `getUniqueTags`: drafts and scheduled posts are excluded, the slug is
 * what appears in a URL, and the original label is kept for display.
 */
export function getUniqueSeries(posts: CollectionEntry<"posts">[]): Series[] {
  const published = posts.filter(postFilter);
  const names = [
    ...new Set(
      published
        .map(post => post.data.series)
        .filter((name): name is string => Boolean(name))
    ),
  ];

  return names
    .map(seriesName => ({
      series: slugifyStr(seriesName),
      seriesName,
      parts: getSeriesParts(published, seriesName),
    }))
    .sort((a, b) => a.seriesName.localeCompare(b.seriesName));
}

/**
 * Titles repeat the series name ("Agent Graph Engineering, Part 2: ..."), which
 * is redundant anywhere the series is already named. Returns the part after it.
 */
export function shortPartTitle(title: string, seriesName: string): string {
  return title.startsWith(`${seriesName}, `)
    ? title.slice(seriesName.length + 2)
    : title;
}
