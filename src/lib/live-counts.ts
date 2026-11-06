import { and, count, desc, eq, gt, isNull, max, ne, or } from "drizzle-orm";

import { getDb, schema } from "./db/index.ts";
import { internNotificationHref } from "./notification-href.ts";

/**
 * What the header badges and the live stream (`/api/live`) show: unread
 * notifications, unread messages, the newest unread notification (for a
 * toast) and when the newest message landed. One call per tick, so each read
 * is index-backed (notifications_unread_idx, message_threads_*_idx,
 * messages_thread_idx).
 */
export type LiveCounts = {
  notifications: number;
  messages: number;
  latest: { id: string; title: string; href: string | null } | null;
  lastMessageAt: string | null;
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Where the newest notification leads. Message alerts open the thread; the rest follow each role's list. */
function hrefOf(role: "intern" | "employer", type: string, data: unknown): string | null {
  const threadId = (data as Record<string, unknown> | null)?.threadId;
  if (type === "new_message" && typeof threadId === "string" && SAFE_ID.test(threadId)) return `/${role}/messages/${threadId}`;
  return role === "intern" ? internNotificationHref(type, data) : "/employer/alerts";
}

export async function countsFor(role: "intern" | "employer", id: string): Promise<LiveCounts> {
  const db = getDb();
  const n = schema.notifications;
  const t = schema.messageThreads;
  const m = schema.messages;
  const mine = role === "intern" ? t.internId : t.employerId;
  const lastRead = role === "intern" ? t.internLastReadAt : t.employerLastReadAt;
  const unread = and(eq(n.recipientType, role), eq(n.recipientId, id), eq(n.isRead, false));

  const [[notes], [latest], [msgs], [last]] = await Promise.all([
    db.select({ value: count() }).from(n).where(unread),
    db.select({ id: n.id, title: n.title, type: n.type, data: n.data }).from(n).where(unread).orderBy(desc(n.createdAt)).limit(1),
    db
      .select({ value: count() })
      .from(m)
      .innerJoin(t, eq(t.id, m.threadId))
      .where(and(eq(mine, id), ne(m.senderType, role), or(isNull(lastRead), gt(m.createdAt, lastRead)))),
    db.select({ at: max(t.lastMessageAt) }).from(t).where(eq(mine, id)),
  ]);

  return {
    notifications: Number(notes?.value ?? 0),
    messages: Number(msgs?.value ?? 0),
    latest: latest ? { id: latest.id, title: latest.title, href: hrefOf(role, latest.type, latest.data) } : null,
    lastMessageAt: last?.at ? new Date(last.at).toISOString() : null,
  };
}
