import { count, desc, eq, sql, type SQL } from "drizzle-orm";
import { Mail, MailOpen, Inbox, CheckCircle2 } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { flattenParams, parsePageRequest, searchAny } from "@/lib/admin/params";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { MessagesInbox } from "@/components/admin/messages-inbox";
import { formatNumber } from "@/lib/format";

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);

  const db = getDb();

  const conditions: (SQL | undefined)[] = [
    searchAny(
      [
        sql`${schema.contactMessages.firstName}`,
        sql`${schema.contactMessages.lastName}`,
        sql`${schema.contactMessages.email}`,
        sql`${schema.contactMessages.subject}`,
        sql`${schema.contactMessages.message}`,
      ],
      req.search,
    ),
    params.status === "unread" ? eq(schema.contactMessages.isRead, false) : undefined,
    params.status === "read" ? eq(schema.contactMessages.isRead, true) : undefined,
    params.type ? eq(schema.contactMessages.queryType, params.type) : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const [
    rows,
    [totalInboundRow],
    [unreadCountRow],
  ] = await Promise.all([
    db
      .select()
      .from(schema.contactMessages)
      .where(where)
      .orderBy(desc(schema.contactMessages.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db.select({ c: count() }).from(schema.contactMessages),
    db.select({ c: count() }).from(schema.contactMessages).where(eq(schema.contactMessages.isRead, false)),
  ]);
  const totalInbound = Number(totalInboundRow?.c ?? 0);
  const unreadCount = Number(unreadCountRow?.c ?? 0);
  const readCount = Math.max(0, totalInbound - unreadCount);


  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Inbound Messages"
        subtitle="Inbound contact inquiries, support tickets and user feedback."
      />

      <StatGrid cols={4}>
        <StatCard
          label="Total received"
          value={formatNumber(totalInbound)}
          hint="All time customer messages"
          icon={Inbox}
          tone="brand"
        />
        <StatCard
          label="Unread inquiries"
          value={formatNumber(unreadCount)}
          hint="Requires team response"
          icon={Mail}
          tone="accent"
        />
        <StatCard
          label="Addressed tickets"
          value={formatNumber(readCount)}
          hint="Marked as reviewed"
          icon={MailOpen}
          tone="success"
        />
        <StatCard
          label="Resolution rate"
          value={`${totalInbound > 0 ? Math.round((readCount / totalInbound) * 100) : 100}%`}
          hint="Reviewed inquiries"
          icon={CheckCircle2}
          tone="info"
        />
      </StatGrid>

      <MessagesInbox initialMessages={rows} />
    </div>
  );
}
