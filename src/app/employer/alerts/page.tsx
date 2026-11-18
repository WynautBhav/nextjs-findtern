import type { Metadata } from "next";
import { and, count, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EmptyScene, FilterTabs, PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { NotificationList, type NotificationRow } from "@/components/app/notification-list";
import { AlertsList } from "./_list";

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
    case "full_time_fee_paid":
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
    // International FTE is applied for from a candidate's full-time offer button.
    case "international_fte_approved":
    case "international_fte_rejected":
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
  let proposals = 0;
  try {
    const db = getDb();
    const [list, [all], [unreadRow], [proposalRow]] = await Promise.all([
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
      db.select({ value: count() }).from(schema.proposals).where(eq(schema.proposals.employerId, session.uid)),
    ]);
    total = Number(all?.value ?? 0);
    unread = Number(unreadRow?.value ?? 0);
    proposals = Number(proposalRow?.value ?? 0);
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
        <PageHead title="Alerts" />
        <LoadError what="your alerts" retryHref={unreadOnly ? "/employer/alerts?show=unread" : "/employer/alerts"} email={SITE.adminEmail} />
      </div>
    );
  }

  const shown = unreadOnly ? unread : total;

  return (
    <div className="pb-20 lg:pb-0">
      <PageHead
        title="Alerts"
        // Nothing to mark: no control, rather than a disabled one.
        action={unread > 0 ? <NotificationList mode="mark-all" /> : undefined}
        className="mb-6"
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          label="Filter alerts"
          value={unreadOnly ? "unread" : "all"}
          hrefFor={(k) => (k === "unread" ? "/employer/alerts?show=unread" : "/employer/alerts")}
          tabs={[
            { key: "all", label: "All", count: total },
            { key: "unread", label: "Unread", count: unread },
          ]}
        />
        {shown > PAGE ? <p className="nums text-sm text-ink-700">Showing the newest {PAGE} of {shown}</p> : null}
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
            who={proposals > 0 ? "Candidates - answer one of your proposals" : "Starts with your first proposal"}
          />
        )
      ) : (
        <AlertsList rows={rows} />
      )}
    </div>
  );
}
