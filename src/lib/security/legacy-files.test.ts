import test from "node:test";
import assert from "node:assert/strict";

import { legacyContentType, legacyPath } from "./store.ts";

const ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

test("M2: legacy .jfif photos are served, as JPEG", () => {
  assert.ok(legacyPath(`academics/1697500000000-${ID}.jfif`));
  assert.ok(legacyPath(`${ID}.JFIF`));
  assert.equal(legacyContentType(`${ID}.jfif`), "image/jpeg");
});

test("legacy paths stay strict", () => {
  for (const bad of ["../x.jpg", `academics/../${ID}.jpg`, `other/${ID}.jpg`, `${ID}.html`, `${ID}.svg`, `${ID}.jpg.exe`, "//etc/passwd"]) {
    assert.equal(legacyPath(bad), null, bad);
  }
  assert.ok(legacyPath(`/uploads/support/${ID}.png`));
});
