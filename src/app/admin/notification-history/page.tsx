import type { Metadata } from "next";
import { count, desc, inArray, notInArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/panel";
import { Pagination } from "@/components/admin/pagination";
import { flattenParams, parsePageRequest } from "@/lib/admin/params";
import { AUTO_NOTIFICATION_TYPES } from "@/lib/admin/notification-types";
import {
  AdminNotificationHistoryView,
  type AdminNotificationItem,
} from "@/components/admin/admin-notification-history-view";

export const metadata: Metadata = {
  title: "Notification History · Admin",
};

export default async function AdminNotificationHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const db = getDb();

  // Automatic reminders are hidden (legacy), and the list pages on the server.
  const manual = notInArray(schema.notifications.type, AUTO_NOTIFICATION_TYPES);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(schema.notifications)
      .where(manual)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db.select({ c: count() }).from(schema.notifications).where(manual),
  ]);
  const total = Number(totalRow?.c ?? 0);

  const internIds = Array.from(
    new Set(rows.filter((r) => r.recipientType === "intern").map((r) => r.recipientId))
  );
  const employerIds = Array.from(
    new Set(rows.filter((r) => r.recipientType === "employer").map((r) => r.recipientId))
  );

  const internMap = new Map<string, { name: string; email: string }>();
  if (internIds.length > 0) {
    const users = await db
      .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName, email: schema.users.email })
      .from(schema.users)
      .where(inArray(schema.users.id, internIds));
    for (const u of users) {
      internMap.set(u.id, {
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Candidate",
        email: u.email,
      });
    }
  }

  const employerMap = new Map<string, { name: string; email: string }>();
  if (employerIds.length > 0) {
    const employers = await db
      .select({ id: schema.employers.id, companyName: schema.employers.companyName, companyEmail: schema.employers.companyEmail })
      .from(schema.employers)
      .where(inArray(schema.employers.id, employerIds));
    for (const e of employers) {
      employerMap.set(e.id, {
        name: e.companyName,
        email: e.companyEmail,
      });
    }
  }

  const notifications: AdminNotificationItem[] = rows.map((r) => {
    const info =
      r.recipientType === "employer"
        ? employerMap.get(r.recipientId)
        : internMap.get(r.recipientId);

    return {
      id: r.id,
      recipientType: r.recipientType,
      recipientId: r.recipientId,
      recipientName: info?.name || "Recipient",
      recipientEmail: info?.email || "-",
      type: r.type,
      title: r.title,
      message: r.message,
      data: r.data,
      isRead: r.isRead,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    };
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Notification History"
        subtitle="View all sent notifications and their delivery status."
      />

      <AdminNotificationHistoryView notifications={notifications} />
      <Pagination
        page={req.page}
        pages={Math.max(1, Math.ceil(total / req.perPage))}
        total={total}
        perPage={req.perPage}
        rowsShown={notifications.length}
        params={params}
        basePath="/admin/notification-history"
        noun="notifications"
      />
    </div>
  );
}
