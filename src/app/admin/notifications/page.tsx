import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, count, eq, notInArray, sql } from "drizzle-orm";
import { searchAny } from "@/lib/admin/params";
import { AUTO_NOTIFICATION_TYPES } from "@/lib/admin/notification-types";
import { realEmployers } from "@/lib/admin/scope";

import { getDb, schema } from "@/lib/db";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { humanizeStatus } from "@/components/admin/status-badge";
import { EmptyScene, Pill } from "@/components/app/primitives";
import { Section } from "@/components/app/stat";
import { ageOf } from "@/lib/admin/age-label";
import { formatNumber } from "@/lib/format";
import { NotificationComposer } from "@/components/admin/notification-composer";

export const metadata: Metadata = { title: "Notifications" };

/**
 * Broadcast composer.
 *
 * The legacy admin had this: a composer with recipient selection (all interns,
 * all employers, or a picked list), a title, a message, and a history table
 * beside it. `POST /api/admin/notifications` and
 * `GET /api/admin/notifications/history` both exist in this build and nothing
 * called them, so the only way to tell a user something had changed was for
 * them to notice on their own.
 *
 * The roster is read here and passed down as ids, so sending "everyone" is one
 * request with an explicit list rather than a server-side fan-out that would
 * be impossible to review or undo.
 */
export default async function AdminNotifications({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = Array.isArray(params.q) ? params.q[0] : (params.q ?? "");

  const header = (
    <AdminPageHeader
      title="Send notification"
      subtitle="It shows in their bell; nothing is emailed."
    />
  );

  try {
    return await render(query);
  } catch (error) {
    console.error("admin notifications load failed", error);
    return (
      <div className="space-y-6">
        {header}
        <Panel>
          <AdminLoadError what="the recipient lists" retryHref="/admin/notifications" />
        </Panel>
      </div>
    );
  }
}

async function render(query: string) {
  const db = getDb();
  // Names as well as emails, every word must match (legacy picker behaviour).
  const internSearch = searchAny([sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`], query);
  const employerSearch = searchAny(
    [sql`${schema.employers.companyName}`, sql`${schema.employers.name}`, sql`${schema.employers.companyEmail}`],
    query,
  );

  const [[internTotal], [employerTotal]] = await Promise.all([
    db.select({ c: count() }).from(schema.users).where(and(eq(schema.users.role, "intern"), eq(schema.users.isActive, true))),
    db.select({ c: count() }).from(schema.employers).where(and(realEmployers(), eq(schema.employers.isActive, true))),
  ]);
  const [interns, employers, history] = await Promise.all([
    query.trim()
      ? db
          .select({
            id: schema.users.id,
            name: schema.users.firstName,
            last: schema.users.lastName,
            email: schema.users.email,
          })
          .from(schema.users)
          .where(and(eq(schema.users.role, "intern"), internSearch))
          .orderBy(desc(schema.users.createdAt))
          .limit(50)
      : db
          .select({
            id: schema.users.id,
            name: schema.users.firstName,
            last: schema.users.lastName,
            email: schema.users.email,
          })
          .from(schema.users)
          .where(eq(schema.users.role, "intern"))
          .orderBy(desc(schema.users.createdAt))
          .limit(50),
    query.trim()
      ? db
          .select({
            id: schema.employers.id,
            name: schema.employers.companyName,
            last: schema.employers.name,
            email: schema.employers.companyEmail,
          })
          .from(schema.employers)
          .where(and(realEmployers(), employerSearch))
          .orderBy(desc(schema.employers.createdAt))
          .limit(50)
      : db
          .select({
            id: schema.employers.id,
            name: schema.employers.companyName,
            last: schema.employers.name,
            email: schema.employers.companyEmail,
          })
          .from(schema.employers)
          .where(realEmployers())
          .orderBy(desc(schema.employers.createdAt))
          .limit(50),
    db
      .select()
      .from(schema.notifications)
      .where(notInArray(schema.notifications.type, AUTO_NOTIFICATION_TYPES))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(15),
  ]);

  const now = new Date();
  const internCount = Number(internTotal?.c ?? 0);
  const employerCount = Number(employerTotal?.c ?? 0);

  return (
    <div className="space-y-10">
      <AdminPageHeader
        title="Send notification"
        subtitle={`${formatNumber(internCount)} active candidates and ${formatNumber(employerCount)} companies can get one. It shows in their bell; nothing is emailed.`}
      />

      <NotificationComposer
        interns={interns.map((i) => ({ id: i.id, label: `${i.name} ${i.last}`.trim(), email: i.email }))}
        employers={employers.map((e) => ({ id: e.id, label: e.name, email: e.email }))}
        totals={{ intern: internCount, employer: employerCount }}
        query={query}
      />

      <Section
        title="Recently sent"
        hint="The 15 newest that people sent, newest first. Automatic reminders are left out."
        action={
          <Link href="/admin/notification-history" className="inline-flex min-h-8 items-center font-medium text-brand-700 underline underline-offset-4 hover:text-brand-900">
            Full history
          </Link>
        }
      >
        {history.length === 0 ? (
          <EmptyScene title="Nothing sent yet" body="Notifications you send from the form above are listed here, with how long ago and whether they were read." next={{ label: "Write the first one", href: "#notif-title" }} />
        ) : (
          <ol className="divide-y divide-ink-200 border-b border-ink-200">
            {history.map((n) => {
              const age = ageOf(n.createdAt, now);
              return (
                <li key={n.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 py-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto]">
                  <span className="nums pt-0.5 text-sm text-ink-600" title={n.createdAt ? new Date(n.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : undefined}>
                    {age.label}
                    <span className="sr-only"> ago</span>
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-ink-900">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 break-words text-sm text-ink-600">{n.message}</p>
                  </div>
                  <p className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-3 sm:row-start-1 sm:justify-end">
                    <Pill tone="neutral">{n.recipientType === "employer" ? "Company" : "Candidate"}</Pill>
                    <Pill tone="new">{humanizeStatus(n.type)}</Pill>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}
