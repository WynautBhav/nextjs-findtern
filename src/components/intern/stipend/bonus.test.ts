import assert from "node:assert/strict";
import { test } from "node:test";

import type { PayoutRow } from "../../../lib/journey.ts";
import { bonusTotals, completionBonusesByHire, totalWithBonusLine } from "./bonus.ts";

const row = (o: Partial<PayoutRow>): PayoutRow => ({
  id: Math.random().toString(36),
  amountMinor: 0,
  currency: "INR",
  status: "paid",
  referenceId: null,
  notes: null,
  kind: "completion_bonus",
  paidAt: null,
  createdAt: new Date("2026-10-08T00:00:00Z"),
  ...o,
});

test("no bonus: the map is empty and stipend rows never become one", () => {
  const stipend = row({ kind: "stipend", amountMinor: 100, bonusProposalId: "p1" });
  assert.equal(completionBonusesByHire([stipend]).size, 0);
  assert.deepEqual(bonusTotals([stipend]), { paidMinor: 0, pendingMinor: 0 });
  assert.equal(totalWithBonusLine({ paidMinor: 5, pendingMinor: 0 }, bonusTotals([stipend])), null);
});

test("a bonus lands on its hire by bonusProposalId; pending and paid are told apart", () => {
  const paid = row({ amountMinor: 250_000, bonusProposalId: "p1", paidAt: new Date("2026-11-12T08:00:00Z"), referenceId: "UTR9" });
  const pending = row({ amountMinor: 150_000, status: "pending", bonusProposalId: "p2", raw: { scheduledFor: "2026-12-05" } });
  const m = completionBonusesByHire([pending, paid]);
  assert.equal(m.get("p1")?.paidMinor, 250_000);
  assert.equal(m.get("p1")?.pendingMinor, 0);
  assert.equal(m.get("p1")?.entries[0].state, "paid");
  assert.equal(m.get("p1")?.entries[0].when?.toISOString(), "2026-11-12T08:00:00.000Z");
  assert.equal(m.get("p1")?.entries[0].referenceId, "UTR9");
  assert.equal(m.get("p2")?.pendingMinor, 150_000);
  assert.equal(m.get("p2")?.entries[0].when?.toISOString().slice(0, 10), "2026-12-05");
  assert.equal(m.get("p3"), undefined);
});

test("several bonuses on one hire add up per state and list paid before scheduled before failed", () => {
  const m = completionBonusesByHire([
    row({ amountMinor: 30, status: "failed", bonusProposalId: "p1" }),
    row({ amountMinor: 20, status: "pending", bonusProposalId: "p1" }),
    row({ amountMinor: 10, bonusProposalId: "p1", paidAt: new Date("2026-11-01T00:00:00Z") }),
    row({ amountMinor: 5, bonusProposalId: "p1", paidAt: new Date("2026-10-01T00:00:00Z") }),
  ]);
  const hb = m.get("p1")!;
  assert.deepEqual([hb.paidMinor, hb.pendingMinor, hb.failedMinor], [15, 20, 30]);
  assert.deepEqual(hb.entries.map((e) => e.state), ["paid", "paid", "pending", "failed"]);
  assert.deepEqual(hb.entries.map((e) => e.amountMinor), [5, 10, 20, 30]);
});

test("falls back to raw.proposalId; a row with no hire or in another currency is not grouped", () => {
  const m = completionBonusesByHire([
    row({ amountMinor: 10, raw: { proposalId: "p9" } }),
    row({ amountMinor: 10 }),
    row({ amountMinor: 10, currency: "USD", bonusProposalId: "p1" }),
  ]);
  assert.deepEqual([...m.keys()], ["p9"]);
  assert.deepEqual(bonusTotals([row({ amountMinor: 10, currency: "USD", bonusProposalId: "p1" })]), { paidMinor: 0, pendingMinor: 0 });
});

test("amounts are whole paise: fractions round, negatives and nulls count as zero", () => {
  const m = completionBonusesByHire([
    row({ amountMinor: 250_049.6, bonusProposalId: "p1" }),
    row({ amountMinor: -500, bonusProposalId: "p1" }),
    row({ amountMinor: null, bonusProposalId: "p1" }),
  ]);
  assert.equal(m.get("p1")?.paidMinor, 250_050);
  assert.equal(Number.isInteger(m.get("p1")?.paidMinor), true);
});

test("the total line adds bonus to stipend, keeps scheduled apart, and is silent without a paid or scheduled bonus", () => {
  const bonus = bonusTotals([row({ amountMinor: 250_000 }), row({ amountMinor: 150_000, status: "pending" }), row({ amountMinor: 999, status: "failed" })]);
  assert.deepEqual(bonus, { paidMinor: 250_000, pendingMinor: 150_000 });
  assert.equal(totalWithBonusLine({ paidMinor: 1_250_000, pendingMinor: 0 }, bonus), "Including completion bonus: ₹15,000 paid · ₹1,500 scheduled");
  assert.equal(totalWithBonusLine({ paidMinor: 0, pendingMinor: 0 }, { paidMinor: 250_050, pendingMinor: 0 }), "Including completion bonus: ₹2,500.50 paid");
  assert.equal(totalWithBonusLine({ paidMinor: 100, pendingMinor: 100 }, { paidMinor: 0, pendingMinor: 0 }), null);
});
