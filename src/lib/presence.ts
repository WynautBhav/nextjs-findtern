/**
 * Candidate presence for employers: "Active now", "Last seen 2h ago", "Offline", or nothing.
 *
 * Employers see it by default; a student hides it with `user_presence.show_activity` (settings). The hide is
 * enforced here, on the server: the query never selects `last_seen_at` for a hidden user, and the labels carry no
 * timestamp. Screens render nothing for a null label, so absence reveals nothing about the toggle. Rules live in
 * presence-logic.ts (tested without a database).
 */
import { inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { presenceText, presenceView, PRESENCE_ONLINE, type PresenceView } from "@/lib/presence-logic";

export type PresenceLabel = string;
export { PRESENCE_ONLINE };

const MAX_IDS = 200;

/** Views for up to 200 users. Every requested id is a key. Hidden users' timestamps never leave the database. */
export async function presenceViews(userIds: string[], now = Date.now()): Promise<Record<string, PresenceView>> {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, MAX_IDS);
  const out: Record<string, PresenceView> = Object.fromEntries(ids.map((id) => [id, { state: "hidden" } as PresenceView]));
  if (!ids.length) return out;
  const p = schema.userPresence;
  const rows = await getDb()
    .select({
      userId: p.userId,
      showActivity: p.showActivity,
      // The CASE keeps a hidden user's timestamp inside Postgres.
      lastSeenAt: sql<Date | null>`CASE WHEN ${p.showActivity} THEN ${p.lastSeenAt} ELSE NULL END`.mapWith(p.lastSeenAt),
    })
    .from(p)
    .where(inArray(p.userId, ids));
  for (const r of rows) out[r.userId] = presenceView(r, now);
  return out;
}

/** Labels for a page of interns. Every requested id is a key; null means show nothing. */
export async function presenceOf(internIds: string[]): Promise<Record<string, PresenceLabel | null>> {
  const now = Date.now();
  const views = await presenceViews(internIds, now);
  return Object.fromEntries(Object.entries(views).map(([id, v]) => [id, presenceText(v, now)]));
}
