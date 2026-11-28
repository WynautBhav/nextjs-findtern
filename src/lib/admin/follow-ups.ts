/**
 * Master data follow-ups (table admin_follow_ups, migration 0057). A log: every save inserts a row, and the newest row
 * for a target is its current status and note. Pure, so the route, the page and the tests share one list of statuses.
 */

export const FOLLOW_UP_TARGETS = ["student", "employer", "college"] as const;
export type FollowUpTarget = (typeof FOLLOW_UP_TARGETS)[number];

export const FOLLOW_UP_STATUSES = ["pending", "followed_up", "responded", "no_response", "escalated"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_LABEL: Record<FollowUpStatus, string> = {
  pending: "To follow up",
  followed_up: "Followed up",
  responded: "Responded",
  no_response: "No response",
  escalated: "Escalated",
};

export const FOLLOW_UP_NOTE_MAX = 2000;

/** The current follow-up of one record (its newest log row). */
export type FollowUp = { status: FollowUpStatus; note: string | null; at: string; by: string | null };

export const isFollowUpStatus = (v: unknown): v is FollowUpStatus => typeof v === "string" && (FOLLOW_UP_STATUSES as readonly string[]).includes(v);

/** Newest row per target from a log (any order in). Unknown statuses are skipped, never shown as something else. */
export function latestFollowUps(rows: { targetId: string; status: string; note: string | null; createdAt: Date | string; by?: string | null }[]): Map<string, FollowUp> {
  const out = new Map<string, FollowUp>();
  for (const r of rows) {
    if (!isFollowUpStatus(r.status)) continue;
    const at = new Date(r.createdAt).toISOString();
    const cur = out.get(r.targetId);
    if (!cur || cur.at < at) out.set(r.targetId, { status: r.status, note: r.note, at, by: r.by ?? null });
  }
  return out;
}

/**
 * The note a new log row carries. A status-only change (the table's dropdown, `keepNote`) carries the newest note on
 * record, read on the server at write time, so it can never put back an older note the browser still holds. The
 * drawer sends the note it shows: blank clears it.
 */
export function noteForNewRow(req: { note?: string | null; keepNote?: boolean }, latestNote: string | null): string | null {
  if (req.keepNote) return latestNote;
  const n = req.note?.trim();
  return n ? n : null;
}
