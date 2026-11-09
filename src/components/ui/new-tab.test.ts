import assert from "node:assert/strict";
import { test } from "node:test";
import { NEW_TAB_HINT, newTabAttrs } from "./new-tab.ts";

test("newTabAttrs: target=_blank always comes with rel=noopener noreferrer", () => {
  assert.deepEqual(newTabAttrs(true), { target: "_blank", rel: "noopener noreferrer" });
});

test("newTabAttrs: off means no attributes, and the hint names the new tab", () => {
  assert.deepEqual(newTabAttrs(false), {});
  assert.deepEqual(newTabAttrs(), {});
  assert.match(NEW_TAB_HINT, /opens in new tab/);
});
