import Link from "next/link";

import { AdminEmpty, AdminPageHeader, Panel, PanelBody } from "@/components/admin/panel";
import { clampPage, DRIVE_STATUSES, DRIVE_STATUS_LABEL } from "@/lib/college/drive-dashboard";
import { adminDriveOverview } from "@/lib/drives/dashboard-db";
import { FILTER_BUTTON, FILTER_CONTROL, FILTER_SELECT, FilterBar, FilterField } from "@/components/admin/filter-controls";
import { cn } from "@/lib/utils";
import { flattenParams } from "@/lib/admin/params";

export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("en-IN");

export default async function AdminDriveOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const { page, pageSize, offset } = clampPage(params.page, params.per ?? 25);
  const q = (params.q ?? "").trim();
  const status = params.status ?? "";
  const data = await adminDriveOverview({ q, status, offset, limit: pageSize });
  const pages = Math.max(1, Math.ceil(data.total / pageSize));
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (status) s.set("status", status);
    if (p > 1) s.set("page", String(p));
    const qs = s.toString();
    return `/admin/drive-overview${qs ? `?${qs}` : ""}`;
  };
  return (
    <div className="space-y-4">
      <AdminPageHeader title="Drive overview" subtitle="Slots, codes sent and activations across all colleges. Read-only." />
      <form method="get" role="search" aria-label="Filter drive orders">
        <FilterBar name="drive-overview">
          <FilterField label="College name" htmlFor="drive-q" className="w-full min-w-[12rem] flex-1 sm:w-auto sm:max-w-md">
            <input id="drive-q" type="search" name="q" defaultValue={q} placeholder="College name" className={cn(FILTER_CONTROL, "w-full")} />
          </FilterField>
          <FilterField label="Has students in status" htmlFor="drive-status" className="max-sm:w-full">
            <select id="drive-status" name="status" defaultValue={status} className={FILTER_SELECT}>
              <option value="">Any status</option>
              {DRIVE_STATUSES.map((s) => (
                <option key={s} value={s}>{DRIVE_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <button type="submit" className={FILTER_BUTTON}>Filter</button>
          </FilterField>
        </FilterBar>
      </form>
      <Panel>
        <PanelBody>
          {data.rows.length === 0 ? (
            <AdminEmpty title="No drive orders" body="No college matches these filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="nums w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="py-2 pr-3">College</th>
                    <th scope="col" className="px-2 text-right">Slots</th>
                    <th scope="col" className="px-2 text-right">Issued</th>
                    <th scope="col" className="px-2 text-right">Activated</th>
                    <th scope="col" className="pl-2 text-right">Unused</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.collegeId} className="border-t">
                      <th scope="row" className="py-2 pr-3 text-left font-medium">
                        <Link href={`/admin/colleges/${r.collegeId}`} className="underline underline-offset-2">{r.name}</Link>
                      </th>
                      <td className="px-2 text-right">{n(r.slots)}</td>
                      <td className="px-2 text-right">{n(r.issued)}</td>
                      <td className="px-2 text-right">{n(r.redeemed)}</td>
                      <td className="pl-2 text-right">{n(r.unused)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <th scope="row" className="py-2 pr-3 text-left">Total ({n(data.total)} colleges)</th>
                    <td className="px-2 text-right">{n(data.totals.slots)}</td>
                    <td className="px-2 text-right">{n(data.totals.issued)}</td>
                    <td className="px-2 text-right">{n(data.totals.redeemed)}</td>
                    <td className="pl-2 text-right">{n(data.totals.unused)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Pagination">
            {page > 1 ? <Link href={href(page - 1)} className="underline">Previous</Link> : <span />}
            <span>Page {Math.min(page, pages)} of {pages}</span>
            {page < pages ? <Link href={href(page + 1)} className="underline">Next</Link> : <span />}
          </nav>
        </PanelBody>
      </Panel>
    </div>
  );
}
