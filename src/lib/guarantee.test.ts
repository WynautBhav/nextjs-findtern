import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARANTEE_MONTHS, guaranteeEnded, guaranteeMisses } from "./guarantee.ts";

const now = new Date("2026-11-04T06:00:00Z");
const declined = { status: "rejected", offerDetails: { declinedBy: "intern" } };
const lapsed = { status: "sent", offerDetails: { startDate: "2026-11-01" } };
const open = { status: "sent", offerDetails: { startDate: "2026-12-01" } };

test("3 declines keep the guarantee", () => {
  const m = guaranteeMisses([declined, declined, declined, open], now);
  assert.deepEqual(m, { declined: 3, lapsed: 0, total: 3 });
  assert.equal(guaranteeEnded({}, m), false);
});

test("3 declines + 1 lapse end it", () => {
  const m = guaranteeMisses([declined, declined, declined, lapsed], now);
  assert.equal(m.lapsed, 1);
  assert.equal(guaranteeEnded({}, m), true);
});

test("withdrawn, sibling/admin expired, admin-rejected are ignored", () => {
  const m = guaranteeMisses(
    [
      { status: "withdrawn", offerDetails: {} },
      { status: "expired", offerDetails: { startDate: "2026-11-01" } },
      { status: "rejected", offerDetails: { closedByAdminAt: "x" } },
      { status: "accepted", offerDetails: { startDate: "2026-11-01" } },
    ],
    now,
  );
  assert.equal(m.total, 0);
});

test("the acknowledged stamp is honoured", () => {
  assert.equal(guaranteeEnded({ guaranteeEndedAt: "2026-11-01T00:00:00Z" }, { total: 0 }), true);
  assert.equal(guaranteeEnded(null, { total: 0 }), false);
});

test("a lapse stamped before the row was expired or withdrawn still counts", () => {
  const stamped = { offerDetails: { startDate: "2026-11-01", lapsedAt: "2026-11-02T00:00:00Z" } };
  const m = guaranteeMisses([declined, declined, declined, { status: "expired", ...stamped }, { status: "withdrawn", ...stamped }], now);
  assert.equal(m.lapsed, 2);
  assert.equal(guaranteeEnded({}, m), true);
});

test("an interview_scheduled offer past its start is not a lapse", () => {
  const m = guaranteeMisses([{ status: "interview_scheduled", offerDetails: { startDate: "2026-11-01" } }], now);
  assert.equal(m.total, 0);
});

test("an offer closed or expired by admin never counts, even when its start day had passed", () => {
  const closed = (status: string, extra: Record<string, unknown> = {}) => ({
    status,
    offerDetails: { startDate: "2026-11-01", closedByAdminAt: "2026-11-03T00:00:00Z", closedByAdminStatus: status, ...extra },
  });
  const m = guaranteeMisses(
    [
      closed("rejected", { lapsedAt: "2026-11-02T00:00:00Z" }),
      closed("expired", { lapsedAt: "2026-11-02T00:00:00Z" }),
      closed("expired"),
      // Still `sent` and past start, with the admin stamp: not a lapse either.
      { status: "sent", offerDetails: { startDate: "2026-11-01", closedByAdminAt: "2026-11-03T00:00:00Z" } },
    ],
    now,
  );
  assert.deepEqual(m, { declined: 0, lapsed: 0, total: 0 });
  // Three declines plus admin-closed lapses stay under the limit.
  const three = guaranteeMisses([declined, declined, declined, closed("rejected", { lapsedAt: "2026-11-02T00:00:00Z" })], now);
  assert.equal(three.total, 3);
  assert.equal(guaranteeEnded({}, three), false);
});

const fullTime = (status: string, extra: Record<string, unknown> = {}) => ({
  status,
  offerDetails: { fullTimeOffer: { jobTitle: "Analyst", annualCtc: 600000 }, startDate: "2026-11-01", ...extra },
});

test("a declined or lapsed full-time conversion offer does not count; internship offers still do", () => {
  const m = guaranteeMisses(
    [
      fullTime("rejected", { declinedBy: "intern" }),
      fullTime("sent"),
      fullTime("expired", { lapsedAt: "2026-11-02T00:00:00Z" }),
    ],
    now,
  );
  assert.deepEqual(m, { declined: 0, lapsed: 0, total: 0 });
  const mixed = guaranteeMisses([declined, declined, declined, fullTime("rejected", { declinedBy: "intern" }), fullTime("sent")], now);
  assert.equal(mixed.total, 3);
  assert.equal(guaranteeEnded({}, mixed), false);
  // The fourth internship miss still ends it.
  assert.equal(guaranteeEnded({}, guaranteeMisses([declined, declined, declined, lapsed, fullTime("sent")], now)), true);
});

test("the guarantee window is 6 months", () => {
  assert.equal(GUARANTEE_MONTHS, 6);
});
