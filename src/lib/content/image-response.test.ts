import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { cmsImageResponse } from "./image-response.ts";

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
