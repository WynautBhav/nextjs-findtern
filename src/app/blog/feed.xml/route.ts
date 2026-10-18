import { getBlogPosts } from "@/lib/content";
import { SITE } from "@/lib/content/site";
import { plainTextExcerpt } from "@/lib/richtext";
import { SITE_URL } from "@/lib/seo";
import { tidyText } from "@/lib/text";

export const revalidate = 3600;

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 for the blog. Feed readers, and a cheap discovery signal. */
export async function GET() {
  const posts = await getBlogPosts().catch(() => []);
  const items = posts
    .map(
      (p) => `
    <item>
      <title>${escape(tidyText(p.title))}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
      <description>${escape(plainTextExcerpt(p.body, 300))}</description>
    </item>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(SITE.name)} Blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml" />
    <description>${escape("How intern hiring, scoring, rate cards, timesheets and the guarantee actually work.")}</description>
    <language>en-in</language>
    <lastBuildDate>${new Date(posts[0]?.publishedAt ?? Date.now()).toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
