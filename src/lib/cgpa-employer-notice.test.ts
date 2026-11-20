import assert from "node:assert/strict";
import { test } from "node:test";

import { cgpaEmployerNotice } from "./cgpa-employer-notice.ts";

const base = { employerId: "emp1", proposalId: "prop1", candidate: "Candidate AB", role: "Backend intern", claimedScore: "8.9", correctedScore: "7.9", scoreType: "cgpa", at: "2026-11-20T10:00:00.000Z" };

test("verified: tells the employer they can pay, links nothing private, one key per offer and decision", () => {
  const n = cgpaEmployerNotice({ ...base, decision: "verified" });
  assert.deepEqual(n.to, { type: "employer", id: "emp1" });
  assert.equal(n.type, "cgpa_verified");
  assert.equal(n.title, "CGPA confirmed: you can now pay for Candidate AB");
  assert.deepEqual(n.data, { proposalId: "prop1" });
  assert.equal(n.dedupeKey, "cgpa_decision:prop1:2026-11-20T10:00:00.000Z");
  const text = `${n.title} ${n.message} ${JSON.stringify(n.email)}`;
  assert.doesNotMatch(text, /8\.9|7\.9/, "no score in the verified notice or its mail");
  assert.equal(n.email?.cta === undefined || /checkout/.test(n.email.cta.url), true);
});

test("corrected: asks the employer to confirm; the mail carries no scores", () => {
  const n = cgpaEmployerNotice({ ...base, decision: "incorrect" });
  assert.equal(n.type, "cgpa_incorrect");
  assert.equal(n.title, "CGPA corrected: confirm to continue");
  assert.match(n.message, /confirm to continue/);
  assert.doesNotMatch(JSON.stringify(n.email), /8\.9|7\.9/);
});

test("the key differs per offer and per decision time, so two offers or a later decision each notify once", () => {
  const key = (o: Partial<typeof base> & { decision: "verified" | "incorrect" }) => cgpaEmployerNotice({ ...base, ...o }).dedupeKey;
  assert.notEqual(key({ decision: "verified" }), key({ decision: "verified", proposalId: "prop2" }));
  assert.notEqual(key({ decision: "verified" }), key({ decision: "verified", at: "2026-11-21T10:00:00.000Z" }));
  assert.equal(key({ decision: "incorrect" }), key({ decision: "incorrect" }));
});
