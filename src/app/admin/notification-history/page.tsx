import type { Metadata } from "next";
import { desc, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/panel";
import {
  AdminNotificationHistoryView,
  type AdminNotificationItem,
} from "@/components/admin/admin-notification-history-view";

export const metadata: Metadata = {
  title: "Notification History · Admin",
};

export default async function AdminNotificationHistoryPage() {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.notifications)
    .orderBy(desc(schema.notifications.createdAt))
    .limit(200);

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
    </div>
  );
}
