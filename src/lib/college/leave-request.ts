/**
 * Pure rules for leaving a college. A student can only REQUEST to leave; the college's placement officer (or a
 * Findtern admin) decides. No DB here: leave-request-db.ts runs these inside a transaction.
 */

export const LEAVE_REASON_MAX = 500;
export const LEAVE_NOTE_MAX = 500;
export const LEAVE_BULK_MAX = 100;

export type LeaveStatus = "requested" | "approved" | "rejected" | "cancelled";
export type LeaveAction = "approve" | "reject";

export type Problem = { status: number; code: string; error: string };

/** The one message every blocked college switch gives. */
export const leaveFirstMessage = (collegeName: string) => `Ask ${collegeName}'s placement officer to approve your leave first.`;

/** An optional free-text field: trimmed, empty means none, over `max` characters is refused (D4). */
export function cleanText(raw: unknown, max: number, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: `${label} must be text` };
  const v = raw.trim();
  if (v.length > max) return { ok: false, error: `${label} can be at most ${max} characters` };
  return { ok: true, value: v === "" ? null : v };
}

/** May this student file a leave request now? `membership` is the live (not left) membership, if any. */
export function requestProblem(membership: { leftAt: Date | null } | null, hasPending: boolean): Problem | null {
  if (!membership || membership.leftAt) return { status: 409, code: "not_member", error: "You are not in a college." };
  if (hasPending) return { status: 409, code: "already_requested", error: "You already have a leave request waiting for your placement office." };
  // A rejected earlier request does not block a new one (D1): the TPO sees the history.
  return null;
}

/**
 * Joining with a college code while in a live membership of a DIFFERENT college is a way to leave without the
 * TPO's approval, so it is refused. The same college's code still works (re-verify, year and branch update).
 */
export function joinProblem(
  existing: { collegeId: string; leftAt: Date | null } | null | undefined,
  targetCollegeId: string,
  existingCollegeName: string,
): Problem | null {
  if (!existing || existing.leftAt) return null;
  if (existing.collegeId === targetCollegeId) return null;
  return { status: 409, code: "leave_needs_approval", error: leaveFirstMessage(existingCollegeName) };
}

export type Outcome = "apply" | "already" | "conflict";

/** What a decision does to a request in this state. Repeating the decision is a no-op; the opposite one is refused. */
export function decisionOutcome(current: string, action: LeaveAction): Outcome {
  if (current === "requested") return "apply";
  const same = (action === "approve" && current === "approved") || (action === "reject" && current === "rejected");
  return same ? "already" : "conflict";
}
