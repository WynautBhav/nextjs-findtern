import { test } from "node:test";
import assert from "node:assert/strict";

import { formatIstPlain, internOfferOverlay, offerGroup, internOfferKey } from "./intern-offer-view.ts";

const NOW = new Date("2026-11-18T12:00:00+05:30");
const H = 3_600_000;
const ago = (h: number) => new Date(NOW.getTime() - h * H).toISOString();
const PENDING = { cgpaVerification: { status: "pending", claimedScore: "8.1", scoreType: "cgpa", semester: 5 } };
const offerAhead = { startDate: "2026-11-25", monthlyHours: 80 };
const row = (status: string, extra: Record<string, unknown> = {}, offerDetails: Record<string, unknown> = {}) => ({ status, hiredAt: null, updatedAt: null, offerDetails: { ...offerAhead, ...offerDetails }, ...extra });

test("accepted and pending inside 48 h: Verifying your CGPA, with the SLA, the disclaimer and the due-by time", () => {
  const o = internOfferOverlay(row("accepted", {}, { acceptedAt: ago(2) }), PENDING, NOW);
  assert.equal(o.kind, "verifying");
  assert.equal(o.label, "Verifying your CGPA");
  assert.equal(o.group, "accepted");
  assert.match(o.sla ?? "", /24-48 hours/);
  assert.match(o.disclaimer ?? "", /confirmation call or email from Findtern/);
  // accepted 2 h ago + 48 h = 20 Nov 10:00 IST
  assert.equal(o.dueBy, "20 Nov, 10:00 AM IST");
  assert.match(o.detail, /We aim to confirm by 20 Nov, 10:00 AM IST\./);
});

test("exactly 48 h and 49 h: overdue, said honestly, no promised time", () => {
  for (const h of [48, 49]) {
    const o = internOfferOverlay(row("accepted", {}, { acceptedAt: ago(h) }), PENDING, NOW);
    assert.equal(o.kind, "verifying_overdue", `${h} h`);
    assert.equal(o.detail, "This is taking longer than usual. We're on it.");
    assert.equal(o.dueBy, null);
  }
});

test("a correction the company has not confirmed reads with both scores", () => {
  const extra = { cgpaVerification: { ...PENDING.cgpaVerification, status: "incorrect", correctedScore: "7.4", decidedAt: ago(1) } };
  const o = internOfferOverlay(row("accepted", {}, { acceptedAt: ago(30) }), extra, NOW);
  assert.equal(o.kind, "correction");
  // B-45: the badge no longer says "Verifying your CGPA" once Findtern has finished and the ball is with the company.
  assert.equal(o.label, "CGPA updated: waiting for the company");
  assert.match(o.detail, /from 8\.1 to 7\.4\. The company needs to confirm before they can pay\./);
  // Confirmed since: a normal accepted offer again.
  assert.equal(internOfferOverlay(row("accepted", {}, { acceptedAt: ago(30), cgpaAckAt: ago(0.5) }), extra, NOW).kind, null);
});

test("verified, never flagged, or no extra data: the existing accepted wording is untouched", () => {
  const verified = { cgpaVerification: { ...PENDING.cgpaVerification, status: "verified" } };
  for (const extra of [verified, {}, null, undefined]) assert.equal(internOfferOverlay(row("accepted", {}, { acceptedAt: ago(5) }), extra, NOW).kind, null);
});

test("only an accepted internship offer verifies: sent, interview, processing, hired and full-time never do", () => {
  for (const status of ["sent", "interview_scheduled", "processing", "hired", "rejected", "withdrawn"]) assert.equal(internOfferOverlay(row(status), PENDING, NOW).kind, null, status);
  assert.equal(internOfferOverlay(row("accepted", { hiredAt: "2026-11-17T00:00:00Z" }), PENDING, NOW).kind, null);
  assert.equal(internOfferOverlay(row("accepted", {}, { fullTimeOffer: { annualCtcMinor: 100000000, jobMode: "remote" } }), PENDING, NOW).kind, null);
});

test("accepted and unpaid past its start day: Expired, filed under Closed", () => {
  const o = internOfferOverlay(row("accepted", {}, { startDate: "2026-11-10", acceptedAt: ago(200) }), PENDING, NOW);
  assert.deepEqual([o.kind, o.label, o.tone, o.group], ["expired_unpaid", "Expired", "closed", "closed"]);
  assert.match(o.detail, /did not complete the payment before the start date/);
});

test("stored expired: by reason; a legacy row with none keeps the existing 'Withdrawn' path", () => {
  assert.equal(internOfferOverlay(row("expired", {}, { expiredReason: "unpaid_past_start" }), null, NOW).kind, "expired_unpaid");
  assert.equal(internOfferOverlay(row("expired", {}, { expiredReason: "admin_closed" }), null, NOW).label, "Closed by Findtern");
  assert.equal(internOfferOverlay(row("expired"), null, NOW).kind, null);
  assert.equal(internOfferOverlay(row("expired", {}, { expiredReason: "accepted_elsewhere" }), null, NOW).kind, null);
  assert.equal(internOfferOverlay(row("expired", {}, { expiredReason: "no_reply_past_start" }), null, NOW).kind, null);
});

test("the key and the group for existing states are unchanged (the overlay is separate)", () => {
  assert.equal(internOfferKey(row("accepted"), NOW), "accepted");
  assert.equal(offerGroup("accepted"), "accepted");
  assert.equal(internOfferKey(row("sent", {}, { startDate: "2026-11-10" }), NOW), "lapsed");
});

test("formatIstPlain: plain India time, empty for junk", () => {
  assert.equal(formatIstPlain("2026-11-19T10:10:00Z"), "19 Nov, 3:40 PM IST");
  assert.equal(formatIstPlain("2026-11-19T18:35:00Z"), "20 Nov, 12:05 AM IST");
  assert.equal(formatIstPlain("2026-11-19T06:30:00Z"), "19 Nov, 12:00 PM IST");
  assert.equal(formatIstPlain(null), "");
  assert.equal(formatIstPlain("nope"), "");
});
