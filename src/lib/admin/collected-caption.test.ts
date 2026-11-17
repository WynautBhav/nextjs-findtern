import assert from "node:assert/strict";
import { test } from "node:test";

import { collectedCaption } from "./collected-caption.ts";

test("with no refunds the caption is the window only", () => {
  assert.equal(collectedCaption({ collectedGrossWeekMinor: 500_000, refundedWeekMinor: 0 }), "last 7 days, India time");
});

test("with refunds the caption names both parts of the net", () => {
  const c = collectedCaption({ collectedGrossWeekMinor: 12_000_000, refundedWeekMinor: 2_950_000 });
  assert.match(c, /1,20,000/);
  assert.match(c, /29,500/);
  assert.match(c, /refunded/);
});
