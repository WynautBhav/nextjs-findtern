import sharp from "sharp";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

/** Widths a page may ask for with `?w=`. Anything else gets the route's own maximum, so the query cannot force arbitrary resizes. */
const WIDTHS = [96, 192, 480, 800, 1600];

export function requestedWidth(url: string, max: number): number {
  const w = Number(new URL(url).searchParams.get("w"));
  return WIDTHS.includes(w) ? Math.min(w, max) : max;
}

/** `srcset` for an image served by a route that honours `?w=`, so a phone does not download the 1600px version. Other URLs have none. */
export function imageSrcSet(src: string | null | undefined, widths: number[] = [480, 800, 1600]): string | undefined {
  if (!src || !/^\/api\/(blog|cms)-image\//.test(src) || /[?&]w=/.test(src)) return undefined;
  const join = src.includes("?") ? "&" : "?";
  const set = widths.filter((w) => WIDTHS.includes(w)).map((w) => `${src}${join}w=${w} ${w}w`).join(", ");
  return set || undefined;
}

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
        .resize({ width: requestedWidth(req.url, maxWidth), withoutEnlargement: true })
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

/**
 * A stored image is served from a route whose path never changes, with `s-maxage=86400` at the CDN, so a replaced
 * image kept showing the old bytes for up to a day. The URL pages emit therefore carries a token derived from the
 * row's `updated_at`: saving the row changes the URL, so the CDN and browsers fetch the new image, while an
 * unchanged row keeps its URL and its cache entry. (Any save of the row changes it, not only an image edit: one
 * refetch per save, which is the safe direction.)
 */
export function imageVersion(updatedAt: Date | string | number | null | undefined): string | null {
  if (updatedAt == null) return null;
  const ms = new Date(updatedAt).getTime();
  return Number.isFinite(ms) ? ms.toString(36) : null;
}

function versioned(route: string, version: string | null | undefined): string {
  return version ? `${route}?v=${version}` : route;
}

/** Inline data URLs become a (versioned) route URL; anything else passes through. */
export function cmsImageSrc(value: string | null | undefined, route: string, version?: string | null): string | null {
  if (!value) return null;
  return value.startsWith("data:") ? versioned(route, version) : value;
}

/** The cover and banner URLs a post's pages use: the blog image route, versioned, only for images the post has. */
export function blogImageRoutes(slug: string, hasCover: boolean, hasBanner: boolean, version?: string | null) {
  const base = `/api/blog-image/${encodeURIComponent(slug)}`;
  return {
    cover: hasCover ? versioned(`${base}/cover`, version) : null,
    banner: hasBanner ? versioned(`${base}/banner`, version) : null,
  };
}
