import { SITE } from "@/lib/content/site";
import { SITE_URL } from "@/lib/seo";

/**
 * /.well-known/security.txt (RFC 9116): where to send a vulnerability report.
 * Expires is computed, not typed, so the file never goes stale; the RFC asks
 * for less than a year ahead.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const expires = new Date(Date.now() + 364 * 86_400_000).toISOString();
  const body = [
    `Contact: mailto:${SITE.email}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
