/**
 * Where an intern notification leads when it is clicked.
 *
 * Legacy (CandidateHeader.tsx getNotificationHref) opened the proposal for
 * "proposal_received" and the interviews page for interview and AI interview
 * alerts, marking the row read on the way. This keeps those and covers the
 * types written since (timesheets, stipends, profile visibility), using the
 * ids the writers already put in `data`. Unknown types return null: the row
 * stays a plain message rather than a link to somewhere arbitrary.
 */

import { NUDGE_KINDS, nudgeHref, type NudgeKind } from "./college/nudge-plan.ts";

function idFrom(data: unknown, key: string): string | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as Record<string, unknown>)[key];
  const value = typeof raw === "string" ? raw.trim() : "";
  // Ids are uuids or legacy slugs; anything with a slash or query is not an id.
  return value && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
}

export function internNotificationHref(type: string, data: unknown): string | null {
  const t = String(type ?? "").toLowerCase();

  // A placement officer's nudge: the dashboard, with the control it is about glowing. Built from the type, never data.url.
  if (t.startsWith("college_nudge_")) {
    const kind = t.slice("college_nudge_".length);
    return (NUDGE_KINDS as readonly string[]).includes(kind) ? nudgeHref(kind as NudgeKind) : "/intern/dashboard";
  }

  if (t.startsWith("proposal_") || t.startsWith("full_time_")) {
    const id = idFrom(data, "proposalId");
    return id ? `/intern/proposals/${encodeURIComponent(id)}` : "/intern/proposals";
  }
  if (t === "ai_interview_scores_live" || t === "internship_completed") return "/intern/record";
  if (t.startsWith("interview_") || t.startsWith("ai_interview_") || t === "meeting_scheduled") {
    return "/intern/interviews";
  }
  if (t.startsWith("timesheet_")) return "/intern/timesheets";
  if (t === "stipend_paid" || t === "completion_bonus_paid" || t.startsWith("payout_")) return "/intern/earnings";
  if (t === "payment_completed" || t === "go_live_fee_paid") return "/intern/dashboard";
  if (t === "profile_completion_nudge") return "/intern/onboarding";
  if (t === "profile_visible_again" || t === "profile_hide_ending") return "/intern/dashboard";
  if (t === "monthly_profile_views" || t === "profile_view") return "/intern/profile";
  if (t === "document_required") return "/intern/documents";
  return null;
}
