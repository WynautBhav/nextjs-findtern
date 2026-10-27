import assert from "node:assert/strict";
import { test } from "node:test";

import { aiInterviewPhase, isAiInterview, isScored, joinableLink, latestAiInterview } from "./ai-interview.ts";
import { internNotificationHref } from "./notification-href.ts";

const row = (over: Partial<{ id: string; employerId: string; status: string | null; meetingLink: string | null; createdAt: string }>) => ({
  id: "i1",
  employerId: "admin",
  status: "waiting",
  meetingLink: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

test("AI rows: legacy id 'admin' or a known AI employer id", () => {
  assert.equal(isAiInterview({ employerId: "admin" }, []), true);
  assert.equal(isAiInterview({ employerId: "e-ai" }, new Set(["e-ai"])), true);
  assert.equal(isAiInterview({ employerId: "e-company" }, new Set(["e-ai"])), false);
});

test("latest AI interview ignores company rounds and picks the newest", () => {
  const rows = [
    row({ id: "old", createdAt: "2026-09-01T00:00:00Z" }),
    row({ id: "company", employerId: "acme", createdAt: "2026-10-20T00:00:00Z" }),
    row({ id: "new", createdAt: "2026-10-10T00:00:00Z" }),
  ];
  assert.equal(latestAiInterview(rows, [])?.id, "new");
  assert.equal(latestAiInterview([row({ employerId: "acme" })], []), null);
});

test("phase follows the legacy header button", () => {
  assert.equal(aiInterviewPhase(null, false), "apply");
  assert.equal(aiInterviewPhase(row({}), false), "waiting");
  assert.equal(aiInterviewPhase(row({ status: "scheduled", meetingLink: "https://meet.example/x" }), false), "ready");
  // A non-http link is not joinable (legacy rejected it too).
  assert.equal(aiInterviewPhase(row({ status: "scheduled", meetingLink: "meet.example/x" }), false), "waiting");
  assert.equal(aiInterviewPhase(row({ status: "completed", meetingLink: "https://x" }), false), "completed");
  // Once scored, nothing else matters; never back to "apply" (INT-10).
  assert.equal(aiInterviewPhase(null, true), "scored");
  assert.equal(aiInterviewPhase(row({ status: "cancelled" }), false), "waiting");
});

test("joinable links are http(s) only", () => {
  assert.equal(joinableLink(" https://a.b/c "), "https://a.b/c");
  assert.equal(joinableLink("javascript:alert(1)"), null);
  assert.equal(joinableLink(null), null);
});

test("scored: a published score or any numeric rating (legacy hasAdminRatings)", () => {
  assert.equal(isScored({ findternScore: 7.5 }), true);
  assert.equal(isScored({ findternScore: 0 }), true);
  assert.equal(isScored({ findternScore: null }), false);
  assert.equal(isScored({ ratings: { coding: 0, aptitude: 6 } }), true);
  assert.equal(isScored({ ratings: { coding: 0 } }), true);
  assert.equal(isScored({ ratings: { coding: "7" } }), false);
  assert.equal(isScored({ ratings: {} }), false);
  assert.equal(isScored(null), false);
});

test("notification links: proposals by id, interviews, money, profile", () => {
  assert.equal(internNotificationHref("proposal_received", { proposalId: "abc-123" }), "/intern/proposals/abc-123");
  assert.equal(internNotificationHref("proposal_updated", {}), "/intern/proposals");
  assert.equal(internNotificationHref("full_time_offer_received", { proposalId: "p1" }), "/intern/proposals/p1");
  assert.equal(internNotificationHref("proposal_received", { proposalId: "../admin" }), "/intern/proposals");
  assert.equal(internNotificationHref("interview_pending", { interviewId: "x" }), "/intern/interviews");
  assert.equal(internNotificationHref("meeting_scheduled", null), "/intern/interviews");
  assert.equal(internNotificationHref("ai_interview_unlocked", {}), "/intern/interviews");
  assert.equal(internNotificationHref("ai_interview_scores_live", {}), "/intern/record");
  assert.equal(internNotificationHref("timesheet_rejected", { timesheetId: "t" }), "/intern/timesheets");
  assert.equal(internNotificationHref("stipend_paid", {}), "/intern/earnings");
  assert.equal(internNotificationHref("profile_completion_nudge", {}), "/intern/onboarding");
  assert.equal(internNotificationHref("custom", {}), null);
  assert.equal(internNotificationHref("Mishita ke messages", {}), null);
});
