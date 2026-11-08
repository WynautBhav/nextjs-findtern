import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { RateLimiter } from "@/lib/security/rate-limit";
import { presenceText, presenceView } from "../presence-logic";
import { otherParticipant } from "./logic";

/** Per-user, in memory (same limitation as the other limiters). */
export const messageLimiter = new RateLimiter(30, 60_000);
export const heartbeatLimiter = new RateLimiter(6, 60_000);
export const threadLimiter = new RateLimiter(20, 60_000);

export async function getThread(id: string) {
  const [t] = await getDb().select().from(schema.threads).where(eq(schema.threads.id, id)).limit(1);
  return t ?? null;
}

export async function pushEvent(userId: string, type: string, payload: Record<string, unknown>) {
  await getDb().insert(schema.realtimeEvents).values({ userId, type, payload });
}

/**
 * The caller's threads. Counterpart is an id plus a presence label only: no email, no phone, no timestamp. A
 * counterpart who hid their activity (user_presence.show_activity) gets a null label and `online: false`; the
 * database never returns their last_seen_at (CASE below), so nothing downstream can leak it.
 */
export async function listThreads(uid: string, role: "employer" | "intern") {
  const db = getDb();
  const mine = role === "employer" ? schema.threads.employerId : schema.threads.internId;
  const rows = await db.select().from(schema.threads).where(eq(mine, uid)).orderBy(desc(schema.threads.lastMessageAt)).limit(200);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const unread = await db
    .select({ threadId: schema.messages.threadId, n: sql<number>`count(*)::int` })
    .from(schema.messages)
    .where(and(inArray(schema.messages.threadId, ids), ne(schema.messages.senderId, uid), isNull(schema.messages.readAt)))
    .groupBy(schema.messages.threadId);
  const unreadBy = new Map(unread.map((u) => [u.threadId, u.n]));
  const last = await db
    .selectDistinctOn([schema.messages.threadId], { threadId: schema.messages.threadId, body: schema.messages.body, senderId: schema.messages.senderId, createdAt: schema.messages.createdAt })
    .from(schema.messages)
    .where(inArray(schema.messages.threadId, ids))
    .orderBy(schema.messages.threadId, desc(schema.messages.createdAt));
  const lastBy = new Map(last.map((l) => [l.threadId, l]));
  const others = rows.map((r) => otherParticipant(r, uid)!);
  const up = schema.userPresence;
  const pres = await db
    .select({
      userId: up.userId,
      showActivity: up.showActivity,
      lastSeenAt: sql<Date | null>`CASE WHEN ${up.showActivity} THEN ${up.lastSeenAt} ELSE NULL END`.mapWith(up.lastSeenAt),
    })
    .from(up)
    .where(inArray(up.userId, others));
  const now = Date.now();
  const presBy = new Map(pres.map((p) => [p.userId, presenceView(p, now)]));
  return rows.map((r) => {
    const other = otherParticipant(r, uid)!;
    const l = lastBy.get(r.id);
    return {
      id: r.id,
      proposalId: r.proposalId,
      counterpartId: other,
      counterpartOnline: presBy.get(other)?.state === "online",
      counterpartPresence: presBy.has(other) ? presenceText(presBy.get(other)!, now) : null,
      lastMessage: l ? { body: l.body, mine: l.senderId === uid, createdAt: l.createdAt } : null,
      lastMessageAt: r.lastMessageAt,
      unread: unreadBy.get(r.id) ?? 0,
    };
  });
}
