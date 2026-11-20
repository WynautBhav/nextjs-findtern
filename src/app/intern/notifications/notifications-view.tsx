import Link from "next/link";

import { EmptyScene, PageHead, SectionHead } from "@/components/app/primitives";
import { NotificationList, type NotificationRow } from "@/components/app/notification-list";
import { cn } from "@/lib/utils";

/** Props only: `page.tsx` reads the data, this draws it (so a fixture can render it too). */
export function NotificationsView({
  rows,
  total,
  unreadCount,
  shown,
  unreadOnly,
}: {
  rows: NotificationRow[];
  total: number;
  unreadCount: number;
  /** How many rows match the filter in the table (the list itself is capped). */
  shown: number;
  unreadOnly: boolean;
}) {
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
        <nav aria-label="Filter notifications" className="mb-6 flex gap-x-6 border-b border-ink-200">
          {[
            { key: "all", label: "All", count: total, href: "/intern/notifications" },
            { key: "unread", label: "Unread", count: unreadCount, href: "/intern/notifications?show=unread" },
          ].map((t) => {
            const on = t.key === (unreadOnly ? "unread" : "all");
            return (
              <Link
                key={t.key}
                href={t.href}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative -mb-px inline-flex min-h-12 items-center gap-1.5 whitespace-nowrap text-sm outline-none transition-colors",
                  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']",
                  "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent",
                  on ? "font-semibold text-ink-900 after:bg-brand-700" : "font-medium text-ink-600 hover:text-ink-900",
                )}
              >
                {t.label}
                <span className={cn("nums", on ? "text-ink-900" : "text-text-subtle")}>{t.count}</span>
              </Link>
            );
          })}
        </nav>
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
              <NotificationList card rows={needsYou} />
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section>
              {needsYou.length > 0 ? <SectionHead title="Everything else" /> : <h2 className="sr-only">All notifications</h2>}
              <NotificationList card rows={rest} />
            </section>
          ) : null}

          {shown > rows.length ? (
            <p className="nums text-sm text-text-subtle">
              Showing the latest {rows.length} of {shown}. Older ones are not listed here.
            </p>
          ) : null}
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
