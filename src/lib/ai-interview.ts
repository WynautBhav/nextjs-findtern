/**
 * The AI interview, as the candidate sees it.
 *
 * Legacy (CandidateHeader.tsx:643-700, dashboard.tsx:627-720) derived one
 * state from the newest interview row owned by the AI employer (id "admin")
 * plus whether admin ratings exist, and the header button followed it:
 *   no row            -> "Apply for AI Interview"
 *   row, no link      -> "Applied for AI Interview" (waiting, no button)
 *   row with a link   -> "AI Interview" (terms gate, then the meeting)
 *   ratings published -> "My Interview" (the result)
 * Once any AI row exists, apply is never offered again (INT-10).
 *
 * Pure so every screen (home, interviews, the apply route) agrees, and so it
 * can be tested without a database.
 */

export type AiInterviewRow = {
  id: string;
  employerId: string;
  status: string | null;
  meetingLink: string | null;
  createdAt: Date | string | null;
};

/**
 * apply     - no AI interview yet; the candidate can request one (once paid)
 * waiting   - requested, the admin has not shared a link yet
 * ready     - the link is there; join through the terms gate
 * completed - the interview happened; the score is not published yet
 * scored    - the Findtern Score is published
 */
export type AiInterviewPhase = "apply" | "waiting" | "ready" | "completed" | "scored";

/** The legacy AI employer id. The shared database has this row (email ai-interview@findtern.ai). */
export const AI_EMPLOYER_ID = "admin";

export function isAiInterview(row: { employerId: string }, aiEmployerIds: Iterable<string>): boolean {
  if (row.employerId === AI_EMPLOYER_ID) return true;
  for (const id of aiEmployerIds) if (id === row.employerId) return true;
  return false;
}

/** Only http(s) links are joinable; legacy rejected anything else the same way. */
export function joinableLink(link: string | null | undefined): string | null {
  const value = String(link ?? "").trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

function time(value: Date | string | null): number {
  if (!value) return 0;
  const t = (typeof value === "string" ? new Date(value) : value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Newest AI interview row (by creation), or null. */
export function latestAiInterview<T extends AiInterviewRow>(rows: T[], aiEmployerIds: Iterable<string>): T | null {
  const ids = [...aiEmployerIds];
  let best: T | null = null;
  for (const row of rows) {
    if (!isAiInterview(row, ids)) continue;
    if (!best || time(row.createdAt) > time(best.createdAt)) best = row;
  }
  return best;
}

export function aiInterviewPhase(row: AiInterviewRow | null, scored: boolean): AiInterviewPhase {
  if (scored) return "scored";
  if (!row) return "apply";
  if (String(row.status ?? "").toLowerCase() === "completed") return "completed";
  return joinableLink(row.meetingLink) ? "ready" : "waiting";
}

/** Legacy `hasAdminRatings` / `findternScore`: either one means the result is out. */
export function isScored(extra: unknown): boolean {
  if (!extra || typeof extra !== "object") return false;
  const bag = extra as Record<string, unknown>;
  const score = typeof bag.findternScore === "number" ? bag.findternScore : Number(bag.findternScore);
  if (bag.findternScore !== null && bag.findternScore !== undefined && bag.findternScore !== "" && Number.isFinite(score)) {
    return true;
  }
  const ratings = bag.ratings;
  if (!ratings || typeof ratings !== "object") return false;
  // Legacy hasAdminRatings: any numeric rating, zero included.
  return Object.values(ratings as Record<string, unknown>).some((v) => typeof v === "number" && Number.isFinite(v));
}
