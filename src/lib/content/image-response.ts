import sharp from "sharp";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

/**
 * Serve a CMS image value. The legacy CMS stored images inline as base64 data
 * URLs; this decodes one so pages can reference it by URL. Anything stored as
 * a URL (an upload route or an external link) is redirected to. SVG is
 * refused, so a CMS value can never be served as script-capable markup from
 * our origin.
 *
 * Stored images are whatever the admin uploaded - a 350 KB PNG for a logo
 * drawn 120px wide was typical - so they are resized to `maxWidth` and
 * re-encoded as WebP before caching. The CDN keeps the small version, and the
 * original is only decoded on a cache miss. GIFs keep their animation as animated
 * WebP.
 */
export async function cmsImageResponse(
  value: string | null | undefined,
  req: Request,
  maxWidth = 640,
): Promise<Response> {
  if (!value) return notFound();

  const m = /^data:([a-z/+.-]+);base64,([\s\S]+)$/i.exec(value);
  if (m) {
    const type = m[1].toLowerCase();
    if (!TYPES.has(type)) return notFound();
    const original = Buffer.from(m[2], "base64");
    let body: Buffer = original;
    let contentType = type;
    try {
      // `animated` keeps every GIF frame: an animated logo becomes an
      // animated WebP, a still GIF a still one.
      body = await sharp(original, { animated: type === "image/gif" })
        .rotate()
        .resize({ width: maxWidth, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      contentType = "image/webp";
    } catch {
      // A file sharp cannot read is still served as stored.
      body = original;
    }
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": contentType, "Cache-Control": CACHE, "X-Content-Type-Options": "nosniff" },
    });
  }
  if (/^https?:\/\//i.test(value) || (value.startsWith("/") && !value.startsWith("//"))) {
    return Response.redirect(new URL(value, req.url), 302);
  }
  return notFound();
}

/** Inline data URLs become a route URL; anything else passes through. */
export function cmsImageSrc(value: string | null | undefined, route: string): string | null {
  if (!value) return null;
  return value.startsWith("data:") ? route : value;
}
