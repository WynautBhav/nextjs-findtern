import type { MetadataRoute } from "next";

import { getBlogPosts } from "@/lib/content";
import { SITE_URL } from "@/lib/seo";

/** Rebuilt hourly so new blog posts appear without a redeploy. */
export const revalidate = 3600;

/* Priority reflects what we want found first: the two commercial pages and
   the home page, then the explanatory pages, then legal. Legal pages change
   rarely and say so. */
const ROUTES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/employers", priority: 0.9, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/interns", priority: 0.8, changeFrequency: "weekly" },
  { path: "/guaranteed-internship-program", priority: 0.7, changeFrequency: "monthly" },
  { path: "/opportunities", priority: 0.8, changeFrequency: "daily" },
  { path: "/blog", priority: 0.8, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  { path: "/terms-and-conditions", priority: 0.3, changeFrequency: "yearly" },
  { path: "/intern-terms-and-conditions", priority: 0.3, changeFrequency: "yearly" },
  { path: "/employer-terms-and-conditions", priority: 0.3, changeFrequency: "yearly" },
  { path: "/intern-nda", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
  const posts = await getBlogPosts().catch(() => []);
  return [
    ...pages,
    ...posts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(p.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
