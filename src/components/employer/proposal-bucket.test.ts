import { test } from "node:test";
import assert from "node:assert/strict";

import { proposalBucket } from "./proposal-bucket.ts";

test("an offer waiting on the candidate is open until its start date passes", () => {
  assert.equal(proposalBucket("sent", false), "open");
  assert.equal(proposalBucket("interview_scheduled", false), "open");
  assert.equal(proposalBucket("draft", false), "open");
  // Past its start with no reply: closed on every screen (dashboard and Proposals agree).
  assert.equal(proposalBucket("sent", true), "closed");
  assert.equal(proposalBucket("interview_scheduled", true), "closed");
});

test("accepted and processing are to pay; hired is hired; the rest closed", () => {
  assert.equal(proposalBucket("accepted", false), "accepted");
  assert.equal(proposalBucket("processing", false), "accepted");
  assert.equal(proposalBucket("hired", false), "hired");
  for (const s of ["rejected", "withdrawn", "expired"]) assert.equal(proposalBucket(s, false), "closed");
  assert.equal(proposalBucket("something_new", false), null);
});
