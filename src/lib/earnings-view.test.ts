import { test } from "node:test";
import assert from "node:assert/strict";

import { earningsView } from "./earnings-view.ts";

test("a hired intern with no payouts yet sees the summary, not the empty state", () => {
  assert.equal(earningsView(0, true), "summary");
  assert.equal(earningsView(0, false), "empty");
  assert.equal(earningsView(2, false), "summary");
});
