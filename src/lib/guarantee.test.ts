import assert from "node:assert/strict";
import { test } from "node:test";

import { guaranteeEnded, guaranteeMisses } from "./guarantee.ts";

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
