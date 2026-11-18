import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb, schema } from "@/lib/db";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { Pagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { EmptyScene } from "@/components/app/primitives";
import { LeadStat } from "@/components/app/stat";
import { UserDot } from "@/components/layout/shell-parts";
import { ageOf } from "@/lib/admin/age-label";
import { formatNumber } from "@/lib/format";
import { DateRangeForm } from "@/components/admin/date-range-form";
import { AUDIT_ACTIONS } from "@/lib/admin/audit";
import { loadAudit, type AuditRow } from "@/lib/admin/audit-query";
import { allows, requiredPermissions } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { flattenParams, parsePageRequest, toPage, toQueryString } from "@/lib/admin/params";

export const metadata: Metadata = { title: "Audit log" };

const IST = "Asia/Kolkata";

function timeOf(d: Date | null): string {
  return d ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST }) : "-";
}

/** The India calendar day an entry belongs to, as a sortable key. */
function dayKey(d: Date | null): string {
  return d ? d.toLocaleDateString("en-CA", { timeZone: IST }) : "unknown";
}

function dayHeading(key: string, now: Date): string {
  if (key === "unknown") return "No date";
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return new Date(`${key}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: IST });
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

  const filtered = Boolean(req.search || params.action || params.staff || params.from || params.to);
  const exportParams = Object.fromEntries(Object.entries(params).filter(([k]) => !["page", "per"].includes(k)));
  const now = new Date();
  const days: { key: string; rows: AuditRow[] }[] = [];
  for (const r of page.rows) {
    const key = dayKey(r.when);
    const last = days[days.length - 1];
    if (last?.key === key) last.rows.push(r);
    else days.push({ key, rows: [r] });
  }
  const latest = page.page === 1 ? page.rows[0] : undefined;
  const latestAge = latest ? ageOf(latest.when, now).label : null;

  return (
    <div className="space-y-6">
      {header}
      <div className="grid items-start gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <LeadStat
          label={filtered ? "Entries match" : "Changes recorded"}
          value={formatNumber(page.total)}
          note={latest && latestAge && latestAge !== "-" ? `The latest was ${latestAge === "now" ? "just now" : `${latestAge} ago`}, by ${latest.staffName || latest.staffEmail || "deleted staff"}.` : undefined}
        />
        <div className="lg:pt-6">
          <TableToolbar
            searchPlaceholder="Search action, staff or target"
            exportHref={`/api/admin/audit-log/export${toQueryString(exportParams)}`}
            filters={[
              { key: "action", label: "Action", allLabel: "Every action", options: Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label })) },
              { key: "staff", label: "Staff", allLabel: "Every staff member", options: staff.map((s) => ({ value: s.id, label: s.name || s.email })) },
            ]}
            extra={<DateRangeForm key="dates" params={params} />}
          />
        </div>
      </div>

      {page.rows.length === 0 ? (
        filtered ? (
          <EmptyScene title="No entries match" body="Nothing matches this search and these filters." next={{ href: "/admin/audit-log", label: "Clear filters" }} />
        ) : (
          <EmptyScene title="Nothing recorded yet" body="Staff changes are listed here as they happen, newest first, with who made them." next={{ href: "/admin/roles", label: "See who has access" }} />
        )
      ) : (
        <div>
          {days.map((day) => (
            <section key={day.key} aria-labelledby={`day-${day.key}`} className="mb-8">
              <h2 id={`day-${day.key}`} className="mb-3 border-b border-ink-200 pb-2 font-display text-lg font-semibold text-ink-900">
                {dayHeading(day.key, now)}
                <span className="nums ml-2 text-sm font-normal text-ink-600">
                  {day.rows.length} {day.rows.length === 1 ? "change" : "changes"}
                </span>
              </h2>
              <ol className="relative ml-[0.4375rem] border-l border-ink-300">
                {day.rows.map((r) => {
                  const who = r.staffName || (r.staffEmail ? "Staff" : "Deleted staff");
                  const label = r.targetName ?? (r.targetType ? `${r.targetType.replace(/_/g, " ")}${r.targetId ? ` ${r.targetId.slice(0, 8)}` : ""}` : null);
                  return (
                    <li key={r.id} className="relative grid gap-x-4 gap-y-1 pb-5 pl-6 last:pb-0 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                      <span aria-hidden className="absolute -left-[0.3125rem] top-1.5 size-2.5 rounded-full border-2 border-canvas bg-ink-500" />
                      <time dateTime={r.when?.toISOString()} className="nums pt-0.5 text-sm text-ink-600">
                        {timeOf(r.when)}
                      </time>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-900">
                          <UserDot name={r.staffName || r.staffEmail || "?"} className="size-6 text-2xs" />
                          <span className="font-semibold" title={r.staffEmail ?? undefined}>
                            {who}
                          </span>
                          <span>{r.actionLabel}</span>
                          {label ? (
                            r.targetHref ? (
                              <Link href={r.targetHref} className="break-words font-medium underline decoration-ink-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-700">
                                {label}
                              </Link>
                            ) : (
                              <span className="break-words font-medium">{label}</span>
                            )
                          ) : null}
                        </p>
                        {r.details ? <p className="mt-1 max-w-3xl break-words text-sm text-ink-600">{r.details}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          <Pagination page={page.page} pages={page.pages} total={page.total} perPage={page.perPage} rowsShown={page.rows.length} params={params} basePath="/admin/audit-log" noun="entries" />
        </div>
      )}
    </div>
  );
}
