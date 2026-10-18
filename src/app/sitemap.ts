import type { MetadataRoute } from "next";

import { getBlogPosts } from "@/lib/content";

/** Rebuilt hourly so new blog posts appear without a redeploy. */
export const revalidate = 3600;

const BASE = "https://findtern.in";

const ROUTES = [
  "",
  "/about",
  "/pricing",
  "/employers",
  "/interns",
  "/guaranteed-internship-program",
  "/opportunities",
  "/blog",
  "/contact",
  "/faq",
  "/privacy",
  "/terms-and-conditions",
  "/intern-terms-and-conditions",
  "/employer-terms-and-conditions",
  "/intern-nda",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ROUTES.map((r) => ({
    url: `${BASE}${r}`,
    changeFrequency: "weekly",
    priority: r === "" ? 1 : 0.7,
  }));
  const posts = await getBlogPosts().catch(() => []);
  return [
    ...pages,
    ...posts.map((p) => ({ url: `${BASE}/blog/${p.slug}`, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
