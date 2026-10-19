import type { Metadata } from "next";
import { and, desc, count, eq, notInArray, sql } from "drizzle-orm";
import { searchAny } from "@/lib/admin/params";
import { AUTO_NOTIFICATION_TYPES } from "@/lib/admin/notification-types";
import { realEmployers } from "@/lib/admin/scope";

import { getDb, schema } from "@/lib/db";
import { AdminEmpty, AdminPageHeader, Panel, PanelHeader, PanelBody } from "@/components/admin/panel";
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Send Notification"
        subtitle="Send one message to candidates, companies, or both. Every send is listed below."
      />

      <NotificationComposer
        interns={interns.map((i) => ({ id: i.id, label: `${i.name} ${i.last}`.trim(), email: i.email }))}
        employers={employers.map((e) => ({ id: e.id, label: e.name, email: e.email }))}
        totals={{ intern: Number(internTotal?.c ?? 0), employer: Number(employerTotal?.c ?? 0) }}
        query={query}
      />

      <Panel>
        <PanelHeader
          title="Recently sent"
          description={`${history.length} most recent notifications across every recipient.`}
        />
        <PanelBody className="p-0">
          {history.length === 0 ? (
            <AdminEmpty
              title="Nothing sent yet"
              body="Notifications you send from the composer above will be listed here."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {history.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink-900">{n.title}</p>
                    <p className="text-2xs text-ink-600">
                      {n.recipientType} ·{" "}
                      {n.createdAt
                        ? new Date(n.createdAt).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-600">{n.message}</p>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}