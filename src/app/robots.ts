import type { MetadataRoute } from "next";

import { SITE_URL, isStagingHost } from "@/lib/seo";

const PRIVATE = ["/admin", "/employer", "/intern", "/api"];

/**
 * Everyone may crawl the marketing site; the signed-in portals and the API
 * are off limits. AI crawlers are listed explicitly so there is no doubt that
 * answer engines are welcome to read and cite the public pages.
 */
export default function robots(): MetadataRoute.Robots {
  // A preview or staging deploy (Vercel) must never be indexed: every page
  // there canonicalises to findtern.in and would only create duplicates.
  if (isStagingHost()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  const aiCrawlers = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "anthropic-ai",
    "PerplexityBot",
    "Google-Extended",
    "Applebot-Extended",
    "Bingbot",
  ];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      ...aiCrawlers.map((userAgent) => ({ userAgent, allow: "/", disallow: PRIVATE })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
