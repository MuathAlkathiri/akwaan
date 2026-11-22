import type { MetadataRoute } from "next";

const SITE_URL = "https://playakwaan.com";

/**
 * What a crawler should index, and how much each page is worth.
 *
 * Only pages a stranger can read without a Match: the home page, the three
 * explainers, and the three legal pages a payment provider checks. Everything
 * behind a join code or a login is deliberately absent — it would be crawled,
 * found empty, and counted against the site.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { path: "", changeFrequency: "weekly" as const, priority: 1 },
    {
      path: "/how-to-play",
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    { path: "/worlds", changeFrequency: "monthly" as const, priority: 0.8 },
    { path: "/faq", changeFrequency: "monthly" as const, priority: 0.6 },
    // Linked from every page's footer and checked by payment providers, so they
    // belong in the map — but nobody searches for them.
    { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/refund", changeFrequency: "yearly" as const, priority: 0.3 },
  ].map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
