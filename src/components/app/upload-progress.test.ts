import test from "node:test";
import assert from "node:assert/strict";
import { PROGRESS_DELAY_MS, nextPercent, uploadPercent } from "./upload-progress.ts";

test("uploadPercent rounds down, so 100 means every byte is sent", () => {
  assert.equal(uploadPercent(0, 1000), 0);
  assert.equal(uploadPercent(1, 3), 33);
  assert.equal(uploadPercent(999, 1000), 99);
  assert.equal(uploadPercent(1000, 1000), 100);
});
test("uploadPercent clamps and refuses to guess", () => {
  assert.equal(uploadPercent(2000, 1000), 100);
  assert.equal(uploadPercent(-5, 1000), 0);
  assert.equal(uploadPercent(10, 0), null);
  assert.equal(uploadPercent(10, NaN), null);
  assert.equal(uploadPercent(NaN, 10), null);
});
test("nextPercent never goes backwards and ignores events without a total", () => {
  assert.equal(nextPercent(40, 10, 100), 40);
  assert.equal(nextPercent(40, 70, 100), 70);
  assert.equal(nextPercent(40, 5, 0), 40);
});
test("the bar waits about a second", () => {
  assert.equal(PROGRESS_DELAY_MS, 1000);
});

import {
  IMAGE_LIMIT_BYTES,
  TRANSPORT_LIMIT_BYTES,
  TRANSPORT_TARGET_BYTES,
  imageTooLargeMessage,
  needsTransportShrink,
  tooLargeStatusMessage,
} from "./upload-progress.ts";

test("image size messages name the 5 MB limit and the real size", () => {
  assert.equal(imageTooLargeMessage(12 * 1024 * 1024), "This image is 12.0 MB. The limit is 5 MB.");
  assert.match(tooLargeStatusMessage(true), /5 MB/);
  assert.match(tooLargeStatusMessage(false), /4 MB/);
});

test("the transport shrink starts below Vercel's 4.5 MB body limit and aims lower still", () => {
  assert.ok(TRANSPORT_LIMIT_BYTES < 4.5 * 1024 * 1024);
  assert.ok(TRANSPORT_TARGET_BYTES < TRANSPORT_LIMIT_BYTES && TRANSPORT_LIMIT_BYTES < IMAGE_LIMIT_BYTES);
  assert.equal(needsTransportShrink(4 * 1024 * 1024), false);
  assert.equal(needsTransportShrink(4.9 * 1024 * 1024), true);
});

import { readFileSync } from "node:fs";

test("file-upload checks the picked image against 5 MB, then shrinks for transport, then names the limit on a bare 413", () => {
  const src = readFileSync(new URL("./file-upload.tsx", import.meta.url), "utf8");
  const limit = src.indexOf("imageTooLargeMessage(file.size)");
  const shrink = src.indexOf("needsTransportShrink(file.size)");
  const send = src.indexOf("await postFile(");
  assert.ok(limit > 0 && shrink > limit && send > shrink, "order: limit, shrink, send");
  assert.match(src, /status === 413 \? tooLargeStatusMessage\(isImage\)/);
});
