import assert from "node:assert/strict";
import { test } from "node:test";

import { withdrawRefusal } from "./proposal-expiry.ts";
import { offerState } from "../components/employer/proposal-state.ts";

const NOW = new Date("2026-11-25T10:00:00Z");
const PAST = { startDate: "2026-11-23", fullTime: null };
const AHEAD = { startDate: "2027-01-10", fullTime: null };
const p = (over: Record<string, unknown> = {}) => ({ status: "sent", hiredAt: null, offerDetails: { startDate: "2026-11-23" }, ...over });

test("a stored expired proposal cannot be withdrawn: refusal says it expired", () => {
  const msg = withdrawRefusal(p({ status: "expired", offerDetails: { startDate: "2027-01-10", expiredReason: "no_reply_past_start" } }), NOW);
  assert.match(msg ?? "", /expired/i);
});

test("an unanswered offer past its start day (sweeper not run yet) is expired too", () => {
  assert.match(withdrawRefusal(p({ status: "sent" }), NOW) ?? "", /expired/i);
  assert.match(withdrawRefusal(p({ status: "interview_scheduled" }), NOW) ?? "", /expired/i);
});

test("an accepted unpaid offer past its start day is expired and cannot be withdrawn", () => {
  assert.match(withdrawRefusal(p({ status: "accepted" }), NOW) ?? "", /expired/i);
});

test("live offers can still be withdrawn", () => {
  assert.equal(withdrawRefusal(p({ status: "sent", offerDetails: { startDate: "2027-01-10" } }), NOW), null);
  assert.equal(withdrawRefusal(p({ status: "accepted", offerDetails: { startDate: "2027-01-10" } }), NOW), null);
  assert.equal(withdrawRefusal(p({ status: "draft", offerDetails: { startDate: "2027-01-10" } }), NOW), null);
});

test("the employer UI state never offers Withdraw on an expired offer, stored or computed", () => {
  const cases = [
    offerState({ status: "sent", hiredAt: null }, PAST, NOW),
    offerState({ status: "interview_scheduled", hiredAt: null }, PAST, NOW),
    offerState({ status: "accepted", hiredAt: null }, PAST, NOW),
    offerState({ status: "expired", hiredAt: null, offerDetails: { expiredReason: "unpaid_past_start" } }, PAST, NOW),
  ];
  for (const s of cases) assert.equal(s.canWithdraw, false, s.label);
  assert.equal(offerState({ status: "sent", hiredAt: null }, AHEAD, NOW).canWithdraw, true);
});
