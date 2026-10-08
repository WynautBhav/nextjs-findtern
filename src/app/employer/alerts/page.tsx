import { eq, desc, and } from "drizzle-orm";
import { Bell } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/layout/page-header";

export default async function EmployerAlerts() {
  const session = await getSession();
  let rows: (typeof schema.notifications.$inferSelect)[] = [];
  try {
    const db = getDb();
    rows = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientType, "employer"),
          eq(schema.notifications.recipientId, session!.uid),
        ),
      )
      .orderBy(desc(schema.notifications.createdAt))
      .limit(50);
  } catch {}

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        subtitle="Updates on candidate proposals, scheduled interviews, and account activity."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="All caught up"
          body="You have no unread notifications or alerts right now."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
          <ul className="divide-y divide-ink-100">
            {rows.map((n) => (
              <li key={n.id} className="flex items-start gap-4 p-5 transition-colors hover:bg-canvas-subtle/60">
                <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Bell className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                    {n.createdAt ? (
                      <span className="text-xs text-text-subtle">
                        {formatDate(n.createdAt)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-text-subtle">{n.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
