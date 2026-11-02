import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { cmsImageResponse, imageSrcSet, requestedWidth } from "./image-response.ts";

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
