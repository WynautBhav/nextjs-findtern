import assert from "node:assert/strict";
import { test } from "node:test";

import { fillFromOlder } from "./intern-docs-merge.ts";

test("a file only an older duplicate row holds is carried onto the newest row, whole (name, type, size)", () => {
  const newest = { aadhaarImageName: "a.webp", aadhaarImageType: "image/webp", aadhaarImageSize: 5 };
  const older = { profilePhotoName: "p.webp", profilePhotoType: "image/webp", profilePhotoSize: 9, panImageName: "n.webp", panImageType: "image/webp", panImageSize: 7 };
  assert.deepEqual(fillFromOlder([newest, older]), {
    profilePhotoName: "p.webp", profilePhotoType: "image/webp", profilePhotoSize: 9,
    panImageName: "n.webp", panImageType: "image/webp", panImageSize: 7,
  });
});

test("the newest row's own file wins; nothing to fill gives an empty patch", () => {
  const newest = { profilePhotoName: "new.webp", profilePhotoType: "image/webp", profilePhotoSize: 1 };
  const older = { profilePhotoName: "old.webp", profilePhotoType: "image/webp", profilePhotoSize: 2 };
  assert.deepEqual(fillFromOlder([newest, older]), {});
  assert.deepEqual(fillFromOlder([]), {});
  assert.deepEqual(fillFromOlder([newest]), {});
});
