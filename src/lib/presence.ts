import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "./db/index.ts";

/**
 * Intern presence for employers (OA2). Activity-based: the client beats only
 * while the tab is visible and says whether the person did anything in the
 * last 2 minutes, so a tab left open does not read as "online forever".
 * Labels are worked out at query time; the exact time is never shown.
 */
export type PresenceLabel = "Online now" | "Active today" | "Active this week";

/** A visible tab beats about every 30 s; 75 s allows one missed beat. */
export const ONLINE_SEEN_MS = 75_000;
/** "Online now" also needs real activity within this window. */
export const ONLINE_ACTIVE_MS = 120_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** presenceOf answers one page of candidates in one query. */
const MAX_IDS = 200;

export type PresenceRow = { lastSeenAt: Date | null; lastActiveAt: Date | null; hidden: boolean };

/** Online: seen < 75 s AND active < 2 min. Today: active < 24 h. Week: active < 7 d. Hidden, never active or older: null. */
export function presenceLabel(row: PresenceRow | null, now: Date): PresenceLabel | null {
  if (!row || row.hidden || !row.lastActiveAt) return null;
  const t = now.getTime();
  const active = t - row.lastActiveAt.getTime();
  const seen = row.lastSeenAt ? t - row.lastSeenAt.getTime() : Infinity;
  if (seen < ONLINE_SEEN_MS && active < ONLINE_ACTIVE_MS) return "Online now";
  if (active < DAY_MS) return "Active today";
  if (active < WEEK_MS) return "Active this week";
  return null;
}

/** Labels for a page of interns, one query. Every requested id is a key (null = no label). */
export async function presenceOf(internIds: string[]): Promise<Record<string, PresenceLabel | null>> {
  const ids = [...new Set(internIds.filter(Boolean))];
  if (ids.length > MAX_IDS) throw new RangeError(`presenceOf takes at most ${MAX_IDS} ids (got ${ids.length})`);
  const out: Record<string, PresenceLabel | null> = Object.fromEntries(ids.map((id) => [id, null]));
  if (ids.length === 0) return out;
  const p = schema.userPresence;
  const rows = await getDb()
    .select({ userId: p.userId, lastSeenAt: p.lastSeenAt, lastActiveAt: p.lastActiveAt, hidden: p.hidden })
    .from(p)
    .where(and(eq(p.userType, "intern"), inArray(p.userId, ids)));
  const now = new Date();
  for (const r of rows) out[r.userId] = presenceLabel(r, now);
  return out;
}
