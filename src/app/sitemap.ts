import type { MetadataRoute } from "next";

const BASE = "https://findtern.in";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/about",
    "/pricing",
    "/employers",
    "/interns",
    "/guaranteed-internship-program",
    "/blog",
    "/contact",
    "/faq",
    "/privacy",
    "/terms-and-conditions",
    "/intern-terms-and-conditions",
    "/employer-terms-and-conditions",
  ];
  return routes.map((r) => ({ url: `${BASE}${r}`, lastModified: new Date(), changeFrequency: "weekly", priority: r === "" ? 1 : 0.7 }));
}
