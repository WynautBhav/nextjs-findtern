import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { blogImageRoutes, cmsImageResponse, cmsImageSrc, imageSrcSet, imageVersion, requestedWidth } from "./image-response.ts";

const req = new Request("http://localhost/api/cms-image/partner/x");

test("a stored PNG is resized and served as WebP", async () => {
  const png = await sharp({ create: { width: 2000, height: 800, channels: 3, background: "#0a6b50" } }).png().toBuffer();
  const res = await cmsImageResponse(`data:image/png;base64,${png.toString("base64")}`, req, 480);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 480);
});

test("small images are not enlarged, GIFs become WebP, SVG is refused", async () => {
  const small = await sharp({ create: { width: 100, height: 40, channels: 3, background: "#fff" } }).jpeg().toBuffer();
  const res = await cmsImageResponse(`data:image/jpeg;base64,${small.toString("base64")}`, req, 480);
  assert.equal((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width, 100);

  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
  const g = await cmsImageResponse(`data:image/gif;base64,${gif.toString("base64")}`, req);
  assert.equal(g.headers.get("content-type"), "image/webp");

  const svg = await cmsImageResponse("data:image/svg+xml;base64,PHN2Zy8+", req);
  assert.equal(svg.status, 404);
});

test("?w= resizes to a listed width, never above the route's maximum, and ignores anything else", async () => {
  const png = await sharp({ create: { width: 2000, height: 800, channels: 3, background: "#0a6b50" } }).png().toBuffer();
  const value = `data:image/png;base64,${png.toString("base64")}`;
  const widthFor = async (q: string, max = 1600) => {
    const res = await cmsImageResponse(value, new Request(`http://localhost/api/blog-image/a/cover${q}`), max);
    return (await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width;
  };
  assert.equal(await widthFor("?w=480"), 480);
  assert.equal(await widthFor("?w=96"), 96);
  assert.equal(await widthFor("?w=481"), 1600, "unlisted width gives the default");
  assert.equal(await widthFor("?w=1600", 640), 640, "capped by the route's own maximum");
});

test("only listed widths are honoured by requestedWidth", () => {
  const u = (q: string) => `https://findtern.test/api/blog-image/a/cover${q}`;
  assert.equal(requestedWidth(u(""), 1600), 1600);
  assert.equal(requestedWidth(u("?w=99999"), 1600), 1600, "too large");
  assert.equal(requestedWidth(u("?w=abc"), 1600), 1600, "not a number");
});

test("srcset is built only for the routes that resize", () => {
  assert.equal(imageSrcSet("/api/blog-image/a/cover"), "/api/blog-image/a/cover?w=480 480w, /api/blog-image/a/cover?w=800 800w, /api/blog-image/a/cover?w=1600 1600w");
  assert.equal(imageSrcSet("/api/cms-image/partner/x", [96, 192]), "/api/cms-image/partner/x?w=96 96w, /api/cms-image/partner/x?w=192 192w");
  assert.equal(imageSrcSet("/api/uploads/abc.webp"), undefined, "a route that ignores ?w= would be fetched three times");
  assert.equal(imageSrcSet("https://cdn.example/x.jpg"), undefined);
  assert.equal(imageSrcSet("/api/blog-image/a/cover?w=480"), undefined, "already sized");
  assert.equal(imageSrcSet(null), undefined);
  assert.equal(imageSrcSet("/api/blog-image/a/cover", [123]), undefined, "unlisted widths are dropped");
});

/* A replaced image keeps its route, so the CDN (s-maxage=86400) and browsers (max-age=3600) kept serving the old
   bytes. The URL the pages emit now carries a version that changes when the row is saved. */

test("imageVersion changes when the row is saved and is empty when unknown", () => {
  const a = imageVersion(new Date("2026-11-17T10:00:00.000Z"));
  const b = imageVersion(new Date("2026-11-17T10:00:00.001Z"));
  assert.ok(a && b && a !== b, "a later save gives a different token");
  assert.equal(a, imageVersion(new Date("2026-11-17T10:00:00.000Z")), "the same save gives the same token");
  assert.equal(imageVersion(null), null);
  assert.equal(imageVersion(new Date("nope")), null);
  assert.match(a!, /^[0-9a-z]+$/, "safe to put in a query string");
});

test("a stored inline image gets a versioned route URL; an external URL is untouched", () => {
  const v = imageVersion(new Date("2026-11-17T10:00:00Z"));
  assert.equal(cmsImageSrc("data:image/png;base64,AAAA", "/api/cms-image/partner/p1", v), `/api/cms-image/partner/p1?v=${v}`);
  assert.equal(cmsImageSrc("data:image/png;base64,AAAA", "/api/cms-image/partner/p1"), "/api/cms-image/partner/p1", "no version known: bare route, as before");
  assert.equal(cmsImageSrc("https://cdn.example/x.png", "/api/cms-image/partner/p1", v), "https://cdn.example/x.png");
  assert.equal(cmsImageSrc("", "/r", v), null);
});

test("blog image routes carry the post's version, only for images that exist", () => {
  const v = imageVersion(new Date("2026-11-17T10:00:00Z"));
  assert.deepEqual(blogImageRoutes("my post", true, true, v), { cover: `/api/blog-image/my%20post/cover?v=${v}`, banner: `/api/blog-image/my%20post/banner?v=${v}` });
  assert.deepEqual(blogImageRoutes("a", true, false, null), { cover: "/api/blog-image/a/cover", banner: null });
  assert.deepEqual(blogImageRoutes("a", false, false, v), { cover: null, banner: null });
});

test("a versioned route still gets a width srcset, joined with &", () => {
  assert.equal(imageSrcSet("/api/blog-image/a/cover?v=k2", [480, 800]), "/api/blog-image/a/cover?v=k2&w=480 480w, /api/blog-image/a/cover?v=k2&w=800 800w");
  assert.equal(imageSrcSet("/api/blog-image/a/cover?v=k2&w=480"), undefined, "already sized");
});

test("the image response keeps its cache headers, so an unchanged image is still cached for a day at the CDN", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
  const res = await cmsImageResponse(`data:image/png;base64,${png.toString("base64")}`, new Request("http://localhost/api/cms-image/partner/x?v=k2"), 480);
  assert.equal(res.headers.get("cache-control"), "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
});
