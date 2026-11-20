import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  ALREADY_LINED_UP,
  CANDIDATE_UNAVAILABLE,
  heldElsewhere,
  hireIsRunning,
  internHeld,
  internshipEndDay,
  rowHoldsIntern,
  type HoldRow,
} from "./candidate-hold.ts";

// Noon IST on 2026-11-20.
const NOW = new Date("2026-11-20T06:30:00Z");

const offer = (startDate: string | null, duration = "2m", extra: Record<string, unknown> = {}) => ({ startDate, duration, ...extra });
const row = (over: Partial<HoldRow> & { start?: string | null; duration?: string }): HoldRow => ({
  employerId: "A",
  status: "accepted",
  hiredAt: null,
  endedAt: null,
  offerDetails: offer(over.start === undefined ? "2026-12-01" : over.start, over.duration ?? "2m"),
  ...over,
});
const held = (r: HoldRow) => rowHoldsIntern(r, NOW);

test("accepted and unpaid, start still ahead: holds", () => assert.equal(held(row({ status: "accepted" })), true));
test("processing holds, even past the start day (money in flight)", () => {
  assert.equal(held(row({ status: "processing" })), true);
  assert.equal(held(row({ status: "processing", start: "2026-11-01" })), true);
});
test("accepted but unpaid past its start day has lapsed: released", () => {
  assert.equal(held(row({ status: "accepted", start: "2026-11-20" })), false);
  assert.equal(held(row({ status: "accepted", start: "2026-11-19" })), false);
});
test("accepted with no start date holds (cannot show it lapsed)", () => assert.equal(held(row({ status: "accepted", start: null })), true));

test("declined, withdrawn, expired and open offers do not hold", () => {
  for (const status of ["rejected", "withdrawn", "expired", "draft", "sent", "interview_scheduled"]) {
    assert.equal(held(row({ status })), false, status);
  }
});

test("hired and running holds", () => assert.equal(held(row({ status: "hired", hiredAt: "2026-11-10T00:00:00Z", start: "2026-11-15", duration: "3m" })), true));
test("hired and upcoming holds", () => assert.equal(held(row({ status: "hired", hiredAt: "2026-11-10T00:00:00Z", start: "2027-01-05" })), true));
test("hired and finished does not hold", () => {
  assert.equal(held(row({ status: "hired", hiredAt: "2026-08-01T00:00:00Z", start: "2026-08-01", duration: "2m" })), false);
  assert.equal(held(row({ status: "hired", hiredAt: "2026-08-01T00:00:00Z", start: "2026-09-20", duration: "2m" })), false); // ended 2026-11-20 (exclusive)
});
test("the last day still holds, the day after releases", () => {
  const r = row({ status: "hired", hiredAt: "2026-09-01T00:00:00Z", start: "2026-09-21", duration: "2m" }); // ends 2026-11-21 (exclusive)
  assert.equal(held(r), true);
  assert.equal(rowHoldsIntern(r, new Date("2026-11-20T20:00:00Z")), false); // 21 Nov 01:30 IST
});
test("a hire ended early (ended_at) releases", () =>
  assert.equal(held(row({ status: "hired", hiredAt: "2026-11-10T00:00:00Z", endedAt: "2026-11-18T00:00:00Z", start: "2026-11-15", duration: "6m" })), false));
test("hired by hiredAt with an older status still counts as a hire", () =>
  assert.equal(held(row({ status: "accepted", hiredAt: "2026-11-10T00:00:00Z", start: "2026-11-15" })), true));
test("full-time hire always holds, even long after the start date", () => {
  const r = row({ status: "hired", hiredAt: "2024-01-01T00:00:00Z", offerDetails: { startDate: "2024-02-01", fullTimeOffer: { annualCtc: 600000 } } });
  assert.equal(held(r), true);
});
test("a hire with missing or invalid dates holds", () => {
  assert.equal(held(row({ status: "hired", hiredAt: "2026-01-01T00:00:00Z", start: null })), true);
  assert.equal(held(row({ status: "hired", hiredAt: "2026-01-01T00:00:00Z", start: "2026-02-30" })), true);
  assert.equal(held(row({ status: "hired", hiredAt: "2026-01-01T00:00:00Z", offerDetails: null })), true);
});
test("a missing duration counts as one month", () => {
  assert.equal(held(row({ status: "hired", hiredAt: "2026-01-01T00:00:00Z", offerDetails: { startDate: "2026-10-01" } })), false); // ended 11-01
  assert.equal(held(row({ status: "hired", hiredAt: "2026-01-01T00:00:00Z", offerDetails: { startDate: "2026-11-01" } })), true); // ends 12-01
});
test("months are read from a duration like '3 months'", () => {
  assert.equal(held(row({ status: "hired", hiredAt: "2026-01-01T00:00:00Z", start: "2026-09-01", duration: "3 months" })), true); // ends 12-01
  assert.equal(held(row({ status: "hired", hiredAt: "2026-01-01T00:00:00Z", start: "2026-09-01", duration: "2m" })), false); // ended 11-01
});

test("internshipEndDay clamps like Postgres and rejects non-days", () => {
  assert.equal(internshipEndDay("2026-01-31", 1), "2026-02-28");
  assert.equal(internshipEndDay("2026-11-15", 3), "2027-02-15");
  assert.equal(internshipEndDay("2026-12-31", 12), "2027-12-31");
  assert.equal(internshipEndDay("2026-02-30", 1), null);
  assert.equal(internshipEndDay("soon", 1), null);
});

test("hireIsRunning is false for a row that is not a hire", () => assert.equal(hireIsRunning(row({ status: "accepted" }), NOW), false));

test("heldElsewhere ignores the employer's own rows", () => {
  const mine = row({ employerId: "B", status: "accepted" });
  const theirs = row({ employerId: "A", status: "accepted" });
  assert.equal(heldElsewhere([mine], "B", NOW), false);
  assert.equal(heldElsewhere([mine, theirs], "B", NOW), true);
  assert.equal(heldElsewhere([theirs], "A", NOW), false);
});
test("own running hire is not 'elsewhere' (existing per-employer rules apply)", () =>
  assert.equal(heldElsewhere([row({ employerId: "B", status: "hired", hiredAt: "2026-11-10T00:00:00Z" })], "B", NOW), false));

test("it releases by itself: the same rows at a later clock", () => {
  const rows = [row({ status: "accepted", start: "2026-12-01" })];
  assert.equal(internHeld(rows, NOW), true);
  assert.equal(internHeld(rows, new Date("2026-11-30T19:00:00Z")), false); // 1 Dec 00:30 IST: start day began unpaid
  assert.equal(internHeld([{ ...rows[0], status: "rejected" }], NOW), false);
});

test("one live hold among many rows is enough", () => {
  assert.equal(internHeld([row({ status: "rejected" }), row({ status: "expired" }), row({ status: "processing" })], NOW), true);
  assert.equal(internHeld([], NOW), false);
});

test("the neutral copy names no company, date or amount", () => {
  assert.equal(CANDIDATE_UNAVAILABLE.code, "candidate_unavailable");
  assert.equal(CANDIDATE_UNAVAILABLE.error, "This candidate is no longer available.");
  assert.doesNotMatch(JSON.stringify(CANDIDATE_UNAVAILABLE) + ALREADY_LINED_UP, /\d|₹|\$|company|employer|pay/i);
});

// Enforcement inventory (source guard, the repo's pattern for routes): every place that must keep a held candidate away.
const ROOT = join(import.meta.dirname, "..", "..");
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");
test("source guard: sending, scheduling, shortlisting, browsing, accepting and paying all apply the hold", () => {
  for (const f of ["src/app/api/employer/[id]/proposals/route.ts", "src/app/api/employer/[id]/interviews/route.ts"]) {
    const s = src(f);
    assert.match(s, /heldElsewhereIds\(db, id, \[b\.internId\]\)/, f);
    assert.match(s, /CANDIDATE_UNAVAILABLE, \{ status: 409 \}/, f);
    assert.ok(s.indexOf("heldElsewhereIds(db") < s.indexOf("canEmployerSeeIntern(db"), `${f}: hold answered before the generic 404`);
  }
  assert.match(src("src/app/api/employer/cart/route.ts"), /poolInternIds\(db, \[internId\], employerId\)/);
  assert.match(src("src/app/employer/candidates/_query.ts"), /not\(heldElsewhereSql\(uid\)\)/);
  assert.match(src("src/app/employer/dashboard/page.tsx"), /not\(heldElsewhereSql\(employerId\)\)/);
  assert.match(src("src/app/employer/intern/[id]/page.tsx"), /keepRelationships: true/);
  const status = src("src/app/api/proposals/[id]/status/route.ts");
  assert.match(status, /rowHoldsIntern\(o\)/);
  assert.match(status, /ALREADY_LINED_UP/);
  const order = src("src/app/api/employer/[id]/payment/razorpay/order/route.ts");
  assert.match(order, /lineHeldByOtherHire\(getDb\(\), id, hireGateLines\(paying\)\)/);
  assert.match(src("src/lib/employer-pool.ts"), /heldElsewhereSql\(employerId\)/);
});
