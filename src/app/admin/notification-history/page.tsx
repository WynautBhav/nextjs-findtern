import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, notInArray, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { DataTable, type Column } from "@/components/admin/data-table";
import { StatusBadge, humanizeStatus } from "@/components/admin/status-badge";
import { Pill } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { AUTO_NOTIFICATION_TYPES } from "@/lib/admin/notification-types";

export const metadata: Metadata = { title: "Notification history" };

const n = schema.notifications;

type Row = {
  id: string;
  recipientType: string;
  recipientId: string;
  recipientName: string | null;
  recipientEmail: string | null;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date | null;
};

function when(d: Date | null): string {
  if (!d) return "-";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Every notification a person sent (automatic reminders are left out, as in
 * legacy), with its recipient and whether they have read it. Filters and
 * search run on the server so the pager counts are true.
 */
export default async function AdminNotificationHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);

  const header = (
    <AdminPageHeader
      title="Notification history"
      subtitle="Everything staff sent to candidates and companies, and whether they have read it. Automatic reminders are not listed."
      action={
        <ButtonLink href="/admin/notifications" variant="primary" size="sm">
          Send a notification
        </ButtonLink>
      }
    />
  );

  let loaded: Awaited<ReturnType<typeof load>> | null = null;
  try {
    loaded = await load(params, req);
  } catch (error) {
    console.error("admin notification history load failed", error);
  }
  if (!loaded) {
    return (
      <div className="space-y-6">
        {header}
        <Panel>
          <AdminLoadError what="the notification history" retryHref="/admin/notification-history" />
        </Panel>
      </div>
    );
  }
  const { page, types } = loaded;

  const columns: Column<Row>[] = [
    {
      header: "Sent",
      cell: (r) => <span className="nums whitespace-nowrap text-ink-600">{when(r.createdAt)}</span>,
    },
    {
      header: "Recipient",
      cell: (r) => (
        <div className="min-w-0 max-w-56">
          <Link
            href={r.recipientType === "employer" ? `/admin/companies/${r.recipientId}` : `/admin/interns/${r.recipientId}`}
            className="block truncate font-medium text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline"
            title={r.recipientName ?? undefined}
          >
            {r.recipientName || "Deleted account"}
          </Link>
          <span className="flex items-center gap-1.5 text-xs text-ink-600">
            {r.recipientType === "employer" ? "Company" : "Candidate"}
            {r.recipientEmail ? <span className="truncate">· {r.recipientEmail}</span> : null}
          </span>
        </div>
      ),
    },
    {
      header: "Notification",
      cell: (r) => (
        <details className="group max-w-md">
          <summary className="cursor-pointer list-none">
            <span className="block truncate font-medium text-ink-900">{r.title}</span>
            <span className="block truncate text-ink-600 group-open:hidden">{r.message}</span>
          </summary>
          <p className="mt-1 whitespace-pre-wrap break-words text-ink-700">{r.message}</p>
          {r.link ? <p className="mt-1 text-xs text-ink-600">Link: {r.link}</p> : null}
        </details>
      ),
    },
    { header: "Type", cell: (r) => <Pill tone="neutral">{humanizeStatus(r.type)}</Pill> },
    {
      header: "Status",
      cell: (r) => <StatusBadge tone={r.isRead ? "success" : "neutral"} label={r.isRead ? "Read" : "Not read yet"} />,
    },
  ];

  return (
    <div className="space-y-6">
      {header}
      <DataTable
        basePath="/admin/notification-history"
        params={params}
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
        rows={page.rows}
        columns={columns}
        noun="notifications"
        caption="Notifications sent by staff"
        searchPlaceholder="Search title, message or recipient"
        filters={[
          {
            key: "recipient",
            label: "Recipient",
            allLabel: "Everyone",
            options: [
              { value: "intern", label: "Candidates" },
              { value: "employer", label: "Companies" },
            ],
          },
          {
            key: "type",
            label: "Type",
            allLabel: "Every type",
            options: types.map((t) => ({ value: t.type, label: humanizeStatus(t.type) })),
          },
          {
            key: "read",
            label: "Read",
            allLabel: "Read and unread",
            options: [
              { value: "read", label: "Read" },
              { value: "unread", label: "Not read yet" },
            ],
          },
        ]}
        empty={
          req.search || params.recipient || params.type || params.read
            ? { title: "No notifications match", body: "Nothing matches this search and these filters.", action: { href: "/admin/notification-history", label: "Clear filters" } }
            : { title: "Nothing sent yet", body: "Notifications staff send from the composer are listed here.", action: { href: "/admin/notifications", label: "Send a notification" } }
        }
      />
    </div>
  );
}

async function load(params: Record<string, string>, req: ReturnType<typeof parsePageRequest>) {
  const db = getDb();
  const fullName = sql<string | null>`coalesce(nullif(trim(coalesce(${schema.users.firstName}, '') || ' ' || coalesce(${schema.users.lastName}, '')), ''), ${schema.employers.companyName})`;
  const email = sql<string | null>`coalesce(${schema.users.email}, ${schema.employers.companyEmail})`;
  const conditions = [
    notInArray(n.type, AUTO_NOTIFICATION_TYPES),
    params.recipient === "intern" || params.recipient === "employer" ? eq(n.recipientType, params.recipient) : undefined,
    params.type ? eq(n.type, params.type) : undefined,
    params.read === "read" ? eq(n.isRead, true) : params.read === "unread" ? eq(n.isRead, false) : undefined,
    searchAny([sql`${n.title}`, sql`${n.message}`, sql`${n.type}`, fullName, email], req.search),
  ].filter((c): c is SQL => Boolean(c));
  const where = and(...conditions);

  const base = db
    .select({
      id: n.id,
      recipientType: n.recipientType,
      recipientId: n.recipientId,
      recipientName: fullName,
      recipientEmail: email,
      type: n.type,
      title: n.title,
      message: n.message,
      link: sql<string | null>`${n.data}->>'link'`,
      isRead: n.isRead,
      createdAt: n.createdAt,
    })
    .from(n)
    .leftJoin(schema.users, and(eq(n.recipientType, "intern"), eq(schema.users.id, n.recipientId)))
    .leftJoin(schema.employers, and(eq(n.recipientType, "employer"), eq(schema.employers.id, n.recipientId)));

  const [rows, [total], types] = await Promise.all([
    base.where(where).orderBy(desc(n.createdAt)).limit(req.perPage).offset(req.offset),
    db
      .select({ c: count() })
      .from(n)
      .leftJoin(schema.users, and(eq(n.recipientType, "intern"), eq(schema.users.id, n.recipientId)))
      .leftJoin(schema.employers, and(eq(n.recipientType, "employer"), eq(schema.employers.id, n.recipientId)))
      .where(where),
    db
      .selectDistinct({ type: n.type })
      .from(n)
      .where(notInArray(n.type, AUTO_NOTIFICATION_TYPES))
      .orderBy(n.type)
      .limit(60),
  ]);
  const page = toPage(rows as Row[], Number(total?.c ?? 0), req.page, req.perPage);
  return { page, types };
}
