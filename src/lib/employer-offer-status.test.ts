import assert from "node:assert/strict";
import { test } from "node:test";

import { OFFER_BLOCKING_STATUSES, isLiveOffer } from "./employer-offer-status.ts";

test("an offer that is out or hired blocks a shortlist add", () => {
  for (const s of ["sent", "interview_scheduled", "accepted", "processing", "hired", "Interview_Scheduled"]) {
    assert.equal(isLiveOffer(s), true, s);
  }
});

test("closed offers do not block", () => {
  for (const s of ["withdrawn", "declined", "rejected", "expired", "", null, undefined]) {
    assert.equal(isLiveOffer(s), false, String(s));
  }
});

test("the route's DB list is the same list", () => {
  assert.ok(OFFER_BLOCKING_STATUSES.includes("interview_scheduled"));
});
