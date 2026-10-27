import type { Metadata } from "next";
import Link from "next/link";

import { EmptyScene, PageHead, SectionHead } from "@/components/app/primitives";
import { NotificationList, type NotificationRow } from "@/components/app/notification-list";
import { requireRole } from "@/lib/auth";
import { notificationsFor } from "@/lib/intern-data";
import { internNotificationHref } from "@/lib/notification-href";
import { cn } from "@/lib/utils";

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

  const all = await notificationsFor(session.uid, 100);
  const unreadCount = all.filter((n) => !n.isRead).length;
  const rows: NotificationRow[] = (unreadOnly ? all.filter((n) => !n.isRead) : all).map((n) => ({
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

      <nav aria-label="Filter notifications" className="mb-6 inline-flex rounded-apple-md bg-ink-100 p-1">
        {(
          [
            ["All", "/intern/notifications", !unreadOnly, all.length],
            ["Unread", "/intern/notifications?show=unread", unreadOnly, unreadCount],
          ] as const
        ).map(([label, href, active, n]) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-apple-sm px-4 text-sm font-medium transition-colors",
              active ? "bg-white text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-900",
            )}
          >
            {label}
            <span className={cn("nums rounded-full px-1.5 text-xs", active ? "bg-brand-50 text-brand-800" : "bg-white/70 text-ink-600")}>
              {n}
            </span>
          </Link>
        ))}
      </nav>

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
        <div className="space-y-10">
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

          <p className="text-sm text-ink-600">
            Findtern only writes here when something real happens: no streak reminders and no nudges to open the app.
          </p>
        </div>
      )}
    </div>
  );
}

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
