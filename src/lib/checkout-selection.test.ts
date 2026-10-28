import test from "node:test";
import assert from "node:assert/strict";

import { selectCheckoutLines } from "./checkout-selection.ts";

const lines = [{ id: "qab-month-2" }, { id: "accepted-offer" }];

test("QA-139: a named proposal shows only that line", () => {
  const r = selectCheckoutLines(lines, "accepted-offer");
  assert.deepEqual(r.lines.map((l) => l.id), ["accepted-offer"]);
  assert.equal(r.missing, false);
});

test("QA-139: a named proposal that isn't payable shows nothing else, and says so", () => {
  const r = selectCheckoutLines(lines, "ritika-unpaid-hire");
  assert.deepEqual(r.lines, []);
  assert.equal(r.missing, true);
  assert.equal(r.requested, "ritika-unpaid-hire");
});

test("no proposal named: every payable line", () => {
  assert.deepEqual(selectCheckoutLines(lines, null).lines.map((l) => l.id), ["qab-month-2", "accepted-offer"]);
  assert.deepEqual(selectCheckoutLines(lines, "  ").lines.length, 2);
});
