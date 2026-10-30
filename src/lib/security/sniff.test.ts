import { test } from "node:test";
import assert from "node:assert/strict";

import { bytesMatchType } from "./sniff.ts";

const b = (...parts: (string | number[])[]) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

test("real file headers match their type", () => {
  assert.ok(bytesMatchType("application/pdf", b("%PDF-1.7\n")));
  assert.ok(bytesMatchType("application/pdf", b("\n\n%PDF-1.4"))); // leading junk is allowed
  assert.ok(bytesMatchType("image/jpeg", b([0xff, 0xd8, 0xff, 0xe0])));
  assert.ok(bytesMatchType("image/png", b([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  assert.ok(bytesMatchType("image/webp", b("RIFF", [0, 0, 0, 0], "WEBPVP8 ")));
  assert.ok(bytesMatchType("video/mp4", b([0, 0, 0, 0x20], "ftypisom")));
  assert.ok(bytesMatchType("video/webm", b([0x1a, 0x45, 0xdf, 0xa3])));
});

test("a renamed executable or a mislabelled image is refused", () => {
  assert.equal(bytesMatchType("application/pdf", b("MZ", [0x90, 0, 3, 0])), false);
  assert.equal(bytesMatchType("image/png", b([0xff, 0xd8, 0xff])), false);
  assert.equal(bytesMatchType("image/jpeg", b("")), false);
  assert.equal(bytesMatchType("application/x-msdownload", b("MZ")), false);
});
