/**
 * Master data follow-ups: three marks per record (owner, 28 Nov).
 *  - Nudge: automatic. Ticked when Findtern (an admin) has nudged the record: notifications of type 'nudge' written by
 *    /api/admin/notifications, the same source as the Findtern nudge count (master-data loadNudgeRows). Never set by
 *    hand, never stored here. TPO nudges (college_nudges) do not tick it. Admins can nudge students and employers;
 *    a college cannot be nudged, so its Nudge mark is "not applicable".
 *  - Call 1 / Call 2: manual ticks, logged in admin_follow_ups (migration 0058). Each save inserts one row
 *    (call_1 | call_2 | call_1_undone | call_2_undone); the newest row per call wins. Call 2 only after Call 1, and
 *    Call 1 cannot be undone while Call 2 is ticked.
 * Pure, so the route, the page and the tests share these rules.
 */

export const FOLLOW_UP_TARGETS = ["student", "employer", "college"] as const;
export type FollowUpTarget = (typeof FOLLOW_UP_TARGETS)[number];

export const CALL_STATUSES = ["call_1", "call_2", "call_1_undone", "call_2_undone"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
export type CallNo = 1 | 2;

export const FOLLOW_UP_NOTE_MAX = 2000;

/** A ticked call: when, by whom, and the note saved with it. */
export type CallMark = { at: string; by: string | null; note: string | null };
/** The three marks of one record. `nudge` is null when not nudged; `nudgeable` false where admins cannot nudge. */
export type FollowUp = { nudge: { at: string } | null; nudgeable: boolean; call1: CallMark | null; call2: CallMark | null };
export const NO_FOLLOW_UP: FollowUp = { nudge: null, nudgeable: true, call1: null, call2: null };

export const statusOf = (call: CallNo, done: boolean): CallStatus => (done ? `call_${call}` : `call_${call}_undone`);
export const isCallStatus = (v: unknown): v is CallStatus => typeof v === "string" && (CALL_STATUSES as readonly string[]).includes(v);

export type LogRow = { targetId: string; status: string; note: string | null; createdAt: Date | string; by?: string | null };

/** Each call's current mark from its log rows (any order): the newest row for that call wins; an undo clears it. */
export function callsOf(rows: Omit<LogRow, "targetId">[]): { call1: CallMark | null; call2: CallMark | null } {
  const newest: Partial<Record<CallNo, { at: string; row: Omit<LogRow, "targetId"> }>> = {};
  for (const r of rows) {
    if (!isCallStatus(r.status)) continue;
    const n: CallNo = r.status.startsWith("call_1") ? 1 : 2;
    const at = new Date(r.createdAt).toISOString();
    const cur = newest[n];
    if (!cur || cur.at < at) newest[n] = { at, row: r };
  }
  const mark = (n: CallNo): CallMark | null => {
    const x = newest[n];
    return x && x.row.status === `call_${n}` ? { at: x.at, by: x.row.by ?? null, note: x.row.note } : null;
  };
  return { call1: mark(1), call2: mark(2) };
}

/** Calls per target from a log of many targets. */
export function callsByTarget(rows: LogRow[]): Map<string, { call1: CallMark | null; call2: CallMark | null }> {
  const by = Map.groupBy(rows, (r) => r.targetId);
  return new Map([...by].map(([id, rs]) => [id, callsOf(rs)]));
}

/** The record's three marks: the nudge comes from the admin-nudge tally (its last Findtern nudge), never from the log. */
export function followUpOf(calls: { call1: CallMark | null; call2: CallMark | null } | undefined, lastAdminNudge: string | null, nudgeable: boolean): FollowUp {
  return { nudge: nudgeable && lastAdminNudge ? { at: lastAdminNudge } : null, nudgeable, call1: calls?.call1 ?? null, call2: calls?.call2 ?? null };
}

/** Why a tick or undo is refused, or null when it is allowed. */
export function callChangeError(cur: { call1: boolean; call2: boolean }, req: { call: CallNo; done: boolean }): string | null {
  if (req.done) return req.call === 2 && !cur.call1 ? "Mark Call 1 first." : null;
  if (req.call === 1 && !cur.call1) return "Call 1 isn't marked.";
  if (req.call === 2 && !cur.call2) return "Call 2 isn't marked.";
  if (req.call === 1 && cur.call2) return "Undo Call 2 first.";
  return null;
}

/** The latest call note and date (Call 2 over Call 1). */
export const latestCall = (f: FollowUp): CallMark | null => f.call2 ?? f.call1;
export const hasAnyFollowUp = (f: FollowUp) => f.nudge !== null || f.call1 !== null || f.call2 !== null;

const DAY_FMT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
/** "27 Nov", India time. */
export const shortDay = (iso: string) => DAY_FMT.format(new Date(iso));

/** The three marks in words, as the table cell, its title and the CSV say them: "Nudge ✓ 27 Nov · Call 1 ✓ 28 Nov · Call 2 –". */
export function followUpText(f: FollowUp): string {
  const one = (label: string, at: string | null, na = false) => (na ? `${label} n/a` : at ? `${label} ✓ ${shortDay(at)}` : `${label} –`);
  return [one("Nudge", f.nudge?.at ?? null, !f.nudgeable), one("Call 1", f.call1?.at ?? null), one("Call 2", f.call2?.at ?? null)].join(" · ");
}

const STAMP_FMT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
/** One history line: "Call 1 marked by Priya 28 Nov, 4:10 PM" (India time). The note is shown under it. */
export function historyText(h: { status: string; at: string; by: string | null }): string {
  const n = h.status.startsWith("call_2") ? 2 : 1;
  const what = h.status.endsWith("_undone") ? "undone" : "marked";
  const when = STAMP_FMT.format(new Date(h.at)).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  return `Call ${n} ${what}${h.by ? ` by ${h.by}` : ""} ${when}`;
}
