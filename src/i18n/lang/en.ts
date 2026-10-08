import type { UIStrings } from "../types";

export default {
  nav: {
    home: "Home",
    posts: "Posts",
    tags: "Tags",
    series: "Series",
    about: "About",
    archives: "Archives",
    search: "Search",
  },
  post: {
    publishedAt: "Published at",
    updatedAt: "Updated",
    sharePostIntro: "Share this post:",
    sharePostOn: "Share this post on {{platform}}",
    sharePostViaEmail: "Share this post via email",
    tagLabel: "Tags",
    backToTop: "Back to top",
    goBack: "Go back",
    editPage: "Edit page",
    previousPost: "Previous Post",
    nextPost: "Next Post",
    seriesLabel: "Part of the series",
    seriesProgress: "{{total}} parts",
    seriesOngoing: "still being written, a new part every few days",
    seriesPrevious: "Previous",
    seriesNext: "Next",
    seriesAllParts: "All {{total}} parts",
  },
  pagination: {
    prev: "Prev",
    next: "Next",
    page: "Page",
  },
  home: {
    socialLinks: "Social Links",
    featured: "Featured",
    recentPosts: "Recent Posts",
    allPosts: "All Posts",
  },
  footer: {
    copyright: "Copyright",
    allRightsReserved: "All rights reserved.",
  },
  pages: {
    tagTitle: "Tag",
    tagDesc: "All the articles with the tag",

    tagsTitle: "Tags",
    tagsDesc: "All the tags used in posts.",

    postsTitle: "Posts",
    postsDesc: "All the articles I've posted.",

    archivesTitle: "Archives",
    archivesDesc: "All the articles I've archived.",

    searchTitle: "Search",
    searchDesc: "Search any article ...",

    seriesListTitle: "Series",
    seriesListDesc: "Multi-part series, in reading order.",
    seriesDesc: "All {{total}} parts of {{series}}, in reading order.",
    seriesDescOngoing: "{{total}} parts so far, in reading order. The series is still being written, with a new part every few days.",
    seriesPartCount: "{{total}} parts",
    seriesPartCountOngoing: "{{total}} parts so far, still being written",
    seriesMoreComing: "A new part goes up every few days.",
  },
  a11y: {
    skipToContent: "Skip to content",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    toggleTheme: "Toggle theme",
    searchPlaceholder: "Search posts...",
    noResults: "No results found",
    goToPreviousPage: "Go to previous page",
    goToNextPage: "Go to next page",
  },
  notFound: {
    title: "404 Not Found",
    message: "Page Not Found",
    goHome: "Go back home",
  },
} satisfies UIStrings;
