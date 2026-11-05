import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb, schema } from "@/lib/db";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { DataTable, type Column } from "@/components/admin/data-table";
import { DateRangeForm } from "@/components/admin/date-range-form";
import { AUDIT_ACTIONS } from "@/lib/admin/audit";
import { loadAudit, type AuditRow } from "@/lib/admin/audit-query";
import { allows, requiredPermissions } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { flattenParams, parsePageRequest, toPage, toQueryString } from "@/lib/admin/params";

export const metadata: Metadata = { title: "Audit log" };

function when(d: Date | null): string {
  if (!d) return "-";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

/** Who did what, newest first. Super-admin tier only (roles:write, enforced in proxy.ts). */
export default async function AdminAuditLogPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  // The proxy gates this too; checking here keeps the log closed if the matcher ever changes.
  const session = await getSession();
  if (!session || !allows(session.permissions, requiredPermissions("/admin/audit-log"))) redirect("/admin/no-access");
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const header = <AdminPageHeader title="Audit log" subtitle="Changes staff made in the admin. Times are IST." />;

  let loaded: Awaited<ReturnType<typeof loadAudit>> | null = null;
  let staff: { id: string; name: string | null; email: string }[] = [];
  try {
    [loaded, staff] = await Promise.all([
      loadAudit(params, req.search, { limit: req.perPage, offset: req.offset }),
      getDb().select({ id: schema.admins.id, name: schema.admins.name, email: schema.admins.email }).from(schema.admins).orderBy(schema.admins.name),
    ]);
  } catch (error) {
    console.error("admin audit log load failed", error);
  }
  if (!loaded) {
    return (
      <div className="space-y-6">
        {header}
        <Panel>
          <AdminLoadError what="the audit log" retryHref="/admin/audit-log" />
        </Panel>
      </div>
    );
  }
  const page = toPage(loaded.rows, loaded.total, req.page, req.perPage);

  const columns: Column<AuditRow>[] = [
    { header: "When", cell: (r) => <span className="nums whitespace-nowrap text-xs">{when(r.when)}</span> },
    {
      header: "Who",
      cell: (r) => (
        <div className="min-w-0 max-lg:text-right">
          <p className="truncate font-medium text-foreground">{r.staffName || (r.staffEmail ? "Staff" : "Deleted staff")}</p>
          {r.staffEmail ? <p className="truncate text-xs text-text-subtle">{r.staffEmail}</p> : null}
        </div>
      ),
    },
    { header: "Action", cell: (r) => <span className="font-medium text-foreground max-lg:text-right">{r.actionLabel}</span> },
    {
      header: "Target",
      cell: (r) => {
        const label = r.targetName ?? (r.targetType ? `${r.targetType.replace(/_/g, " ")}${r.targetId ? ` ${r.targetId.slice(0, 8)}` : ""}` : "-");
        return r.targetHref ? (
          <Link href={r.targetHref} className="break-words text-foreground underline underline-offset-4 hover:text-brand-700 max-lg:text-right">{label}</Link>
        ) : (
          <span className="break-words max-lg:text-right">{label}</span>
        );
      },
    },
    { header: "Details", cell: (r) => <span className="block max-w-md break-words text-xs text-text-subtle max-lg:whitespace-normal max-lg:text-right">{r.details || "-"}</span> },
  ];

  const filtered = Boolean(req.search || params.action || params.staff || params.from || params.to);
  const exportParams = Object.fromEntries(Object.entries(params).filter(([k]) => !["page", "per"].includes(k)));
  return (
    <div className="space-y-6">
      {header}
      <DataTable
        basePath="/admin/audit-log"
        params={params}
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
        rows={page.rows}
        rowKey={(r) => r.id}
        columns={columns}
        noun="entries"
        caption="Admin audit log"
        searchPlaceholder="Search action, staff or target id"
        exportHref={`/api/admin/audit-log/export${toQueryString(exportParams)}`}
        filters={[
          { key: "action", label: "Action", allLabel: "Every action", options: Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label })) },
          { key: "staff", label: "Staff", allLabel: "Every staff member", options: staff.map((s) => ({ value: s.id, label: s.name || s.email })) },
        ]}
        extraControls={<DateRangeForm params={params} />}
        empty={filtered ? { title: "No entries match", body: "Nothing matches this search and these filters.", action: { href: "/admin/audit-log", label: "Clear filters" } } : { title: "Nothing recorded yet", body: "Staff changes are listed here as they happen." }}
      />
    </div>
  );
}
