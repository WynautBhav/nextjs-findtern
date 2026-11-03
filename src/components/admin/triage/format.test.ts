import assert from "node:assert/strict";
import { test } from "node:test";

import { agoLabel, figureTone, rowFigures } from "./format.ts";

const NOW = Date.parse("2026-11-03T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

test("an unread message from 2 h ago says so, it is not overdue", () => {
  const f = rowFigures({ queue: "messages", amountMinorInr: null, ageDays: 0, when: hoursAgo(2) }, NOW);
  assert.equal(f.main, "2 h ago");
  assert.ok(!/overdue/.test(`${f.main} ${f.sub}`));
});

test("an offer accepted 29 days ago keeps its rupees and says it has been waiting", () => {
  const f = rowFigures({ queue: "accepted", amountMinorInr: 6_500_000, ageDays: 29, when: hoursAgo(29 * 24) }, NOW);
  assert.equal(f.main, "₹65,000");
  assert.equal(f.sub, "waiting 29 d");
});

test("a payout past its due date is overdue, one due later is 'in'", () => {
  assert.equal(rowFigures({ queue: "payouts", amountMinorInr: 1_000_000, ageDays: 6, when: hoursAgo(6 * 24) }, NOW).sub, "overdue 6 d");
  assert.equal(rowFigures({ queue: "payouts", amountMinorInr: 1_000_000, ageDays: 0, when: new Date(NOW + 5 * 3_600_000).toISOString() }, NOW).sub, "in 5 h");
});

test("a payout with no due date shows its age or nothing, never a made-up deadline", () => {
  assert.deepEqual(rowFigures({ queue: "payouts", amountMinorInr: 1_552_000, ageDays: null, when: null }, NOW), { main: "₹15,520", sub: null });
});

test("agoLabel rejects bad dates", () => {
  assert.equal(agoLabel("nope", NOW), null);
});

test("figureTone: overdue is danger, waiting and due now warn, a slot ahead is info, anything else neutral", () => {
  assert.equal(figureTone("overdue 6 d"), "danger");
  assert.equal(figureTone("waiting 29 d"), "warning");
  assert.equal(figureTone("due now"), "warning");
  assert.equal(figureTone("in 5 h"), "info");
  assert.equal(figureTone("3 d"), "neutral");
  assert.equal(figureTone(null), "neutral");
});
