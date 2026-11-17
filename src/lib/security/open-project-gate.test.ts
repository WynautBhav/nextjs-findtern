import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(import.meta.dirname, "../../app");
const read = (p: string) => readFileSync(join(APP, p), "utf8");

/**
 * A paused (or otherwise not-open) project takes no NEW offers, meetings or shortlist entries, but what already exists on
 * it carries on to completion. No DB route harness exists, so this pins the wiring: the routes that create business ask
 * isProjectOpen; the routes that move existing business along do not.
 */

const CREATE_GATES = [
  "api/employer/[id]/proposals/route.ts", // send a new offer
  "api/employer/[id]/interviews/route.ts", // book a new meeting
  "api/employer/cart/route.ts", // add to the shortlist
];

const KEEPS_WORKING = [
  "api/proposals/[id]/route.ts", // an intern answers an offer
  "api/proposals/[id]/status/route.ts", // an offer moves along (accept, withdraw, hire)
  "api/interviews/[id]/select-slot/route.ts", // an invited candidate picks a time
  "api/employer/[id]/payment/razorpay/order/route.ts", // paying for an accepted offer
  "api/timesheets/[id]/export/route.ts",
];

for (const p of CREATE_GATES) {
  test(`${p} refuses a project that is not open`, () => {
    assert.match(read(p), /isProjectOpen\(project\.status, project\.takenDownAt\)/);
  });
}

for (const p of KEEPS_WORKING) {
  test(`${p} does not ask whether the project is open, so existing work on a paused project completes`, () => {
    assert.doesNotMatch(read(p), /isProjectOpen|isOpenProject/);
  });
}
