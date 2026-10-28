import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EmptyScene } from "@/components/app/primitives";
import { NotificationList, type NotificationRow } from "@/components/app/notification-list";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Alerts",
  robots: { index: false, follow: false },
};

const PAGE = 100;

/**
 * Where an alert leads. Legacy deep-linked these from its bell; the ids come
 * from the notification's `data` (proposalId on offer updates, timesheetId on
 * a submitted sheet), falling back to the list page.
 */
function hrefFor(type: string, data: Record<string, unknown> | null): string | null {
  const id = (key: string) => (typeof data?.[key] === "string" && data[key] ? encodeURIComponent(data[key] as string) : null);
  switch (type) {
    case "proposal_status":
    case "proposal_accepted":
    case "proposal_rejected":
    case "proposal_declined":
    case "proposal_expired":
    case "full_time_offer_status":
      return id("proposalId") ? `/employer/proposal/${id("proposalId")}` : "/employer/proposals";
    case "timesheet_submitted":
      return id("timesheetId") ? `/employer/timesheets/${id("timesheetId")}` : "/employer/timesheets";
    case "meeting_scheduled":
    case "interview_reminder":
    case "interview_feedback_request":
    case "interview_scheduled":
    case "slot_selected":
      return "/employer/schedule";
    case "payment_completed":
    case "payment_failed":
    case "monthly_payment_due":
      return "/employer/orders";
    case "cart_inactivity":
      return "/employer/cart";
    case "talent_spotlight":
      return "/employer/candidates";
    case "employer_profile_completion_nudge":
      return "/employer/account";
    default:
      return null;
  }
}

/**
 * Alerts (EMH-12): legacy had an unread badge, Mark read, Mark all read and
 * an All / Unread filter; this page had a read-only list and the sidebar's
 * unread count never went down. It reuses the intern NotificationList, whose
 * read calls go through the CSRF-aware fetch and roll back visibly on error.
 */
export default async function EmployerAlerts({
  searchParams,
}: {
  searchParams: Promise<{ show?: string | string[] }>;
}) {
  const session = await requireRole("employer");
  const { show } = await searchParams;
  const unreadOnly = show === "unread";

  const mine = and(
    eq(schema.notifications.recipientType, "employer"),
    eq(schema.notifications.recipientId, session.uid),
  );

  let rows: NotificationRow[] = [];
  let total = 0;
  let unread = 0;
  try {
    const db = getDb();
    const [list, [all], [unreadRow]] = await Promise.all([
      db
        .select()
        .from(schema.notifications)
        .where(unreadOnly ? and(mine, eq(schema.notifications.isRead, false)) : mine)
        .orderBy(desc(schema.notifications.createdAt))
        .limit(PAGE),
      db.select({ value: count() }).from(schema.notifications).where(mine),
      db
        .select({ value: count() })
        .from(schema.notifications)
        .where(and(mine, eq(schema.notifications.isRead, false))),
    ]);
    total = Number(all?.value ?? 0);
    unread = Number(unreadRow?.value ?? 0);
    rows = list.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      createdAt: n.createdAt,
      href: hrefFor(n.type, n.data ?? null),
    }));
  } catch (err) {
    console.error("Failed to load employer alerts:", err);
    return (
      <div>
        <PageHeader title="Alerts" />
        <EmptyScene
          art
          title="Couldn't load your alerts"
          body="Something went wrong on our side while loading your alerts. Nothing is lost - reload the page in a moment."
          who="Us - a connection issue"
        />
      </div>
    );
  }

  const shown = unreadOnly ? unread : total;

  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle="Offer replies, interviews, timesheets and payments, newest first."
        action={<NotificationList mode="mark-all" disabled={unread === 0} />}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter alerts" className="inline-flex rounded-apple-md border border-ink-200/80 bg-white p-1 shadow-xs">
          {(
            [
              ["All", "/employer/alerts", !unreadOnly, total],
              ["Unread", "/employer/alerts?show=unread", unreadOnly, unread],
            ] as const
          ).map(([label, href, active, n]) => (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "apple-spring inline-flex min-h-10 items-center gap-1.5 rounded-apple-sm px-3.5 text-sm font-medium touch:min-h-11",
                active ? "bg-brand-700 text-white shadow-xs" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
              )}
            >
              {label}
              <span className={cn("nums text-xs", active ? "text-white/80" : "text-text-subtle")}>{n}</span>
            </Link>
          ))}
        </nav>
        {shown > PAGE ? <p className="nums text-sm text-ink-600">Showing the newest {PAGE} of {shown}</p> : null}
      </div>

      {rows.length === 0 ? (
        unreadOnly && total > 0 ? (
          <EmptyScene
            art
            title="You're all caught up"
            body="Every alert has been read. Older ones are still under All."
            next={{ label: "Show all alerts", href: "/employer/alerts" }}
          />
        ) : (
          <EmptyScene
            art
            title="No alerts yet"
            body="When a candidate answers an offer, books an interview slot or sends a timesheet, it shows up here and on the bell."
            next={{ label: "Find candidates", href: "/employer/candidates" }}
            who="Starts with your first proposal"
          />
        )
      ) : (
        <NotificationList rows={rows} />
      )}
    </div>
  );
}
