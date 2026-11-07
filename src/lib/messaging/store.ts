import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { RateLimiter } from "@/lib/security/rate-limit";
import { isOnline, otherParticipant } from "./logic";

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

/** The caller's threads. Counterpart is an id plus online flag only: no email, no phone. */
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
  const pres = await db.select().from(schema.userPresence).where(inArray(schema.userPresence.userId, others));
  const presBy = new Map(pres.map((p) => [p.userId, p.lastSeenAt]));
  return rows.map((r) => {
    const other = otherParticipant(r, uid)!;
    const l = lastBy.get(r.id);
    return {
      id: r.id,
      proposalId: r.proposalId,
      counterpartId: other,
      counterpartOnline: isOnline(presBy.get(other)),
      lastMessage: l ? { body: l.body, mine: l.senderId === uid, createdAt: l.createdAt } : null,
      lastMessageAt: r.lastMessageAt,
      unread: unreadBy.get(r.id) ?? 0,
    };
  });
}
