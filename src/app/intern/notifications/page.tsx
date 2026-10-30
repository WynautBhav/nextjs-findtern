import type { Metadata } from "next";

import { EmptyScene, FilterTabs, PageHead, SectionHead } from "@/components/app/primitives";
import { NotificationList, type NotificationRow } from "@/components/app/notification-list";
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

  const needsYou = rows.filter((n) => NEEDS_ACTION.has(n.type) && !n.isRead);
  const rest = rows.filter((n) => !(NEEDS_ACTION.has(n.type) && !n.isRead));

  return (
    <div>
      <PageHead
        title="Notifications"
        lede={
          unreadCount > 0
            ? `${unreadCount} unread. Open one to go straight to what it is about.`
            : "You are all caught up. New offers, interviews and payments land here."
        }
        action={<NotificationList mode="mark-all" disabled={unreadCount === 0} />}
      />

      {/* The shared tab look; hidden when All and Unread are the same list. */}
      {unreadOnly || (unreadCount > 0 && unreadCount < total) ? (
        <FilterTabs
          label="Filter notifications"
          className="mb-6"
          value={unreadOnly ? "unread" : "all"}
          tabs={[
            { key: "all", label: "All", count: total },
            { key: "unread", label: "Unread", count: unreadCount },
          ]}
          hrefFor={(k) => (k === "unread" ? "/intern/notifications?show=unread" : "/intern/notifications")}
        />
      ) : null}

      {rows.length === 0 ? (
        unreadOnly ? (
          <EmptyScene
            title="No unread notifications"
            body="Everything that has arrived has been read. Switch to All to see the history."
            next={{ label: "Show all", href: "/intern/notifications" }}
          />
        ) : (
          <EmptyScene
            art
            title="Nothing has happened yet"
            body="When a company sends you an offer, books an interview or approves your hours, it appears here and on your home screen."
            next={{ label: "Back to home", href: "/intern/dashboard" }}
          />
        )
      ) : (
        <div className="space-y-8">
          {needsYou.length > 0 ? (
            <section>
              <SectionHead title="Needs you" hint="A decision, a document, or something waiting on your side." />
              <NotificationList rows={needsYou} />
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section>
              {needsYou.length > 0 ? <SectionHead title="Everything else" /> : null}
              <NotificationList rows={rest} />
            </section>
          ) : null}

          {shown > list.length ? (
            <p className="nums text-sm text-text-subtle">
              Showing the latest {list.length} of {shown}. Older ones are not listed here.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

const LIMIT = 100;

/** Notification types that put work on the candidate's side. */
const NEEDS_ACTION = new Set([
  "proposal_received",
  "proposal_updated",
  "full_time_offer_received",
  "interview_pending",
  "interview_reschedule_requested_by_employer",
  "interview_rescheduled_by_employer",
  "ai_interview_unlocked",
  "timesheet_rejected",
  "timesheet_updated_by_employer",
  "document_required",
]);
