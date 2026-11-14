import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The canvas shrink and the cropper need a browser, so this guards the wiring
// from source. The browser run is documented in the WP-E report.
const src = readFileSync(new URL("./photo-upload.tsx", import.meta.url), "utf8");

test("photo upload: the old hard 1 MB rejection before cropping is gone", () => {
  assert.doesNotMatch(src, /1 \* MB/);
  assert.doesNotMatch(src, /limit is 1 MB/i);
  assert.doesNotMatch(src, /up to 1 MB/i);
  assert.doesNotMatch(src, /file\.size\s*>\s*MAX_BYTES/, "the raw pick must not be size-checked");
});

test("photo upload: the pick is shrunk before the size check and before the cropper opens", () => {
  const shrink = src.indexOf("await shrinkImage(file)");
  const cap = src.indexOf("ready.size > MAX_BYTES");
  const open = src.indexOf("URL.createObjectURL(ready)");
  assert.ok(shrink > 0 && cap > shrink && open > cap, "order: shrink, then cap on the shrunk file, then cropper");
  assert.match(src, /UnreadableImageError/);
});

test("photo upload: JPG or PNG only, copy matches, output contract unchanged", () => {
  assert.match(src, /const TYPES = \["image\/jpeg", "image\/png"\]/);
  assert.match(src, /JPG or PNG/);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /pdf|webp/i, "no PDF or WebP in accept or copy");
  assert.match(src, /const OUTPUT = 600/);
  assert.match(src, /"x-document-kind": "profile_photo"/);
  assert.match(src, /"image\/jpeg", 0\.92/);
});
