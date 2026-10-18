import { NextResponse } from "next/server";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Serve a CMS image value. The legacy CMS stored images inline as base64 data
 * URLs; this decodes one so pages can reference it by URL. Anything stored as
 * a URL (an upload route or an external link) is redirected to. SVG is
 * refused, so a CMS value can never be served as script-capable markup from
 * our origin.
 */
export function cmsImageResponse(value: string | null | undefined, req: Request): Response {
  if (!value) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const m = /^data:([a-z/+.-]+);base64,([\s\S]+)$/i.exec(value);
  if (m) {
    const type = m[1].toLowerCase();
    if (!TYPES.has(type)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new Response(new Uint8Array(Buffer.from(m[2], "base64")), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (/^https?:\/\//i.test(value) || (value.startsWith("/") && !value.startsWith("//"))) {
    return NextResponse.redirect(new URL(value, req.url), 302);
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Inline data URLs become a route URL; anything else passes through. */
export function cmsImageSrc(value: string | null | undefined, route: string): string | null {
  if (!value) return null;
  return value.startsWith("data:") ? route : value;
}
