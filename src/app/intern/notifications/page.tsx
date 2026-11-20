import type { Metadata } from "next";

import { type NotificationRow } from "@/components/app/notification-list";
import { NotificationsView } from "./notifications-view";
import { and, desc, eq, sql } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { internNotificationHref } from "@/lib/notification-href";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

/**
 * Notifications.
 *
 * Two groups: "Needs you" (a decision, a deadline or a document, unread) and
 * everything else. Legacy had an All / Unread switch with a count (INT-28);
 * it is a link here, so the filter survives a reload and works without JS.
 * Each row with a destination opens it and marks itself read (INT-15).
 */
export default async function InternNotifications({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const session = await requireRole("intern");
  const { show } = await searchParams;
  const unreadOnly = show === "unread";

  // The list is capped; the counts are not, so they come from the table.
  const db = getDb();
  const mine = and(eq(schema.notifications.recipientType, "intern"), eq(schema.notifications.recipientId, session.uid));
  const [list, [counts]] = await Promise.all([
    db
      .select()
      .from(schema.notifications)
      .where(unreadOnly ? and(mine, eq(schema.notifications.isRead, false)) : mine)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(LIMIT),
    db
      .select({
        total: sql<number>`count(*)::int`,
        unread: sql<number>`(count(*) filter (where not ${schema.notifications.isRead}))::int`,
      })
      .from(schema.notifications)
      .where(mine),
  ]);
  const total = counts?.total ?? 0;
  const unreadCount = counts?.unread ?? 0;
  const shown = unreadOnly ? unreadCount : total;
  const rows: NotificationRow[] = list.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt,
    href: internNotificationHref(n.type, n.data),
  }));

  return (
    <NotificationsView
      rows={rows}
      total={total}
      unreadCount={unreadCount}
      shown={shown}
      unreadOnly={unreadOnly}
    />
  );

}

const LIMIT = 100;
