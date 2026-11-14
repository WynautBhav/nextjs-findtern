import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import { KINDS, checkType, isImagesOnly, prepareUpload } from "./upload-rules.ts";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const raw = (w: number, h: number) => ({ create: { width: w, height: h, channels: 3 as const, background: { r: 200, g: 40, b: 40 } } });
const jpeg = (w = 400, h = 300) => sharp(raw(w, h)).jpeg().toBuffer();
const png = (w = 400, h = 300) => sharp(raw(w, h)).png().toBuffer();
const isWebp = (b: Buffer) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";

for (const kindName of ["aadhaar", "pan"] as const) {
  const kind = KINDS[kindName];

  test(`${kindName}: is an images-only kind (no PDF in the allow-list)`, () => {
    assert.deepEqual([...kind.types].sort(), ["image/jpeg", "image/png", "image/webp"]);
    assert.ok(isImagesOnly(kind));
  });

  test(`${kindName}: application/pdf is rejected with 415 and a message that does not offer PDF`, () => {
    const r = checkType(kind, "application/pdf");
    assert.ok(r);
    assert.equal(r.status, 415);
    assert.match(r.error, /JPG, PNG or WebP/);
    assert.doesNotMatch(r.error, /Upload the original PDF/);
  });

  test(`${kindName}: other types (gif, video, octet-stream, empty) are rejected`, () => {
    for (const t of ["image/gif", "video/mp4", "application/octet-stream", "text/html", ""]) {
      assert.equal(checkType(kind, t)?.status, 415, t);
    }
  });

  test(`${kindName}: a PDF body labelled image/jpeg is refused by the sniffer, with no PDF wording`, async () => {
    const r = await prepareUpload(kindName, kind, "image/jpeg", PDF, "card.jpg");
    assert.equal(r.ok, false);
    assert.ok(!r.ok);
    assert.equal(r.status, 415);
    assert.doesNotMatch(r.error, /PDF/);
  });

  test(`${kindName}: JPEG and PNG come out as real WebP, named .webp, typed image/webp`, async () => {
    for (const [type, name, input] of [
      ["image/jpeg", "My Card.JPG", await jpeg()],
      ["image/png", "scan.png", await png()],
    ] as const) {
      const r = await prepareUpload(kindName, kind, type, input, name);
      assert.ok(r.ok, type);
      assert.ok(isWebp(r.bytes), `${type} -> RIFF....WEBP`);
      assert.equal(r.contentType, "image/webp");
      assert.match(r.fileName, /\.webp$/);
      assert.equal((await sharp(r.bytes).metadata()).format, "webp");
    }
  });

  test(`${kindName}: a WebP upload is re-encoded too (never stored as sent)`, async () => {
    const input = await sharp(raw(400, 300)).webp().toBuffer();
    const r = await prepareUpload(kindName, kind, "image/webp", input, "a.webp");
    assert.ok(r.ok);
    assert.ok(isWebp(r.bytes));
    assert.notDeepEqual(r.bytes, input);
  });

  test(`${kindName}: a corrupt image is rejected and nothing is returned to store`, async () => {
    const good = await jpeg();
    const truncated = good.subarray(0, Math.floor(good.length / 3));
    const junk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
    const wrongPng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
    for (const [type, body] of [["image/jpeg", truncated], ["image/jpeg", junk], ["image/png", wrongPng]] as const) {
      const r = await prepareUpload(kindName, kind, type, body, "bad.jpg");
      assert.equal(r.ok, false, type);
      assert.ok(!r.ok);
      assert.equal(r.status, 415);
      assert.equal("bytes" in r, false, "no bytes handed back for storage");
    }
  });
}

test("EXIF-rotated JPEG comes out upright, size-capped and without EXIF", async () => {
  // 3000x1000 stored sideways with orientation 6 (rotate 90 CW): upright it is 1000x3000, capped to 2000 high.
  const input = await sharp(raw(3000, 1000)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.equal((await sharp(input).metadata()).orientation, 6);
  const r = await prepareUpload("aadhaar", KINDS.aadhaar, "image/jpeg", input, "side.jpg");
  assert.ok(r.ok);
  const meta = await sharp(r.bytes).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.height, 2000);
  assert.equal(meta.width, 667);
  assert.ok(meta.height! > meta.width!, "upright: portrait after rotation");
  assert.equal(meta.exif, undefined, "EXIF stripped");
});

test("an oversized image is capped to 2000px on the long side, small ones are not enlarged", async () => {
  const big = await prepareUpload("pan", KINDS.pan, "image/png", await png(4000, 2500), "big.png");
  assert.ok(big.ok);
  const m = await sharp(big.bytes).metadata();
  assert.deepEqual([m.width, m.height], [2000, 1250]);
  const small = await prepareUpload("pan", KINDS.pan, "image/png", await png(300, 200), "small.png");
  assert.ok(small.ok);
  assert.deepEqual([(await sharp(small.bytes).metadata()).width, (await sharp(small.bytes).metadata()).height], [300, 200]);
});

test("other kinds keep their PDFs (marksheet, certificate, support, offer_letter) and PDFs are stored as sent", async () => {
  for (const k of ["marksheet", "certificate", "support", "offer_letter"]) {
    assert.equal(checkType(KINDS[k], "application/pdf"), null, k);
    assert.equal(isImagesOnly(KINDS[k]), false, k);
    const r = await prepareUpload(k, KINDS[k], "application/pdf", PDF, "doc.pdf");
    assert.ok(r.ok, k);
    assert.equal(r.contentType, "application/pdf");
    assert.deepEqual(r.bytes, PDF);
    assert.equal(r.fileName, "doc.pdf");
  }
  // The generic message still names PDF where PDF is allowed.
  const r = await prepareUpload("marksheet", KINDS.marksheet, "application/pdf", Buffer.from("MZ not a pdf"), "x.pdf");
  assert.ok(!r.ok);
  assert.match(r.error, /PDF/);
});

test("the upload route delegates to the rules module and stores only what prepareUpload returns", () => {
  const src = readFileSync(join(import.meta.dirname, "../../app/api/uploads/route.ts"), "utf8");
  assert.match(src, /prepareUpload\(kindName, kind, type, bytes,/);
  assert.match(src, /put\(kind\.isPublic \? "public" : session\.uid, prepared\.bytes, contentType, kind\.max\)/);
  // No other put() or raw `bytes` store in the route.
  assert.equal((src.match(/\bput\(/g) ?? []).length, 1);
});
