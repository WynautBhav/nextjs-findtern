import Link from "next/link";

import { Ledger } from "@/components/admin/money/ledger";
import { activationShare, split } from "@/components/admin/money/dv-model";
import { SlotBar, SlotLegend } from "@/components/admin/money/dv-bar";
import { Pager } from "@/components/admin/pagination";
import { AdminPageHeader } from "@/components/admin/panel";
import { RollingNumber } from "@/components/app/rolling-number";
import { EmptyScene } from "@/components/app/primitives";
import { LeadStat, Overview, StatList } from "@/components/app/stat";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clampPage, DRIVE_STATUSES, DRIVE_STATUS_LABEL } from "@/lib/college/drive-dashboard";
import { adminDriveOverview } from "@/lib/drives/dashboard-db";
import { flattenParams } from "@/lib/admin/params";

export const dynamic = "force-dynamic";

const BASE = "/admin/drive-overview";
const n = (v: number) => v.toLocaleString("en-IN");

/** Same box as the app Input, for the one native select (there is no Select in src/components/ui). */
const SELECT =
  "h-9 min-w-0 rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 max-lg:h-11";

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
  const filtered = Boolean(q || status);
  const t = data.totals;
  const share = activationShare({ slots: t.slots, issued: t.issued, redeemed: t.redeemed });
  const scale = Math.max(0, ...data.rows.map((r) => r.slots));
  const pageParams = Object.fromEntries(Object.entries({ q, status, per: params.per ?? "" }).filter(([, v]) => v));

  return (
    <div>
      <AdminPageHeader title="Drive overview" subtitle="Slots bought, codes sent and activations across all colleges. Read-only." />

      <Overview
        lead={
          <LeadStat
            label="Activated, of codes issued"
            value={
              <>
                <RollingNumber value={t.redeemed} />
                {t.issued > 0 ? <span className="ml-3 text-lg font-medium text-ink-700"> of {n(t.issued)}</span> : null}
              </>
            }
            tone={t.redeemed > 0 ? "brand" : "ink"}
            note={
              t.issued > 0
                ? `${share}% of issued codes have been activated. ${filtered ? "Across the colleges matching the filters." : `Across ${n(data.total)} ${data.total === 1 ? "college" : "colleges"}.`}`
                : data.total > 0
                  ? "No code has been sent yet. Colleges issue codes from their drive page."
                  : "No college has bought drive slots yet."
            }
          />
        }
        rest={
          <StatList
            items={[
              { label: "Slots bought", hint: filtered ? "Colleges matching the filters" : "Every college, paid orders only", value: n(t.slots) },
              { label: "Codes issued", hint: "Sent to students, used or not", value: n(t.issued) },
              { label: "Not issued yet", hint: "Slots bought, no code sent", value: n(t.unused) },
            ]}
          />
        }
      />

      <section aria-labelledby="dv-colleges" className="mt-12">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b-2 border-ink-800 pb-2">
          <h2 id="dv-colleges" className="font-display text-lg font-semibold text-ink-900">
            Colleges
          </h2>
          {scale > 0 ? <p className="text-sm text-ink-600">Bars are scaled to the largest college on this page, {n(scale)} slots.</p> : null}
        </div>

        <form method="get" role="search" className="mb-5 flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-ink-700 sm:max-w-sm">
            College name
            <Input name="q" defaultValue={q} placeholder="Search colleges" autoComplete="off" className="max-lg:h-11" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink-700 max-sm:w-full">
            Has students in status
            <select name="status" defaultValue={status} className={SELECT}>
              <option value="">Any status</option>
              {DRIVE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {DRIVE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClass({ size: "sm", variant: data.rows.length > 0 ? "primary" : "outline" })}>
            Filter
          </button>
          {filtered ? (
            <Link href={BASE} className="inline-flex min-h-9 items-center text-sm font-medium text-ink-900 underline underline-offset-4 max-lg:min-h-11">
              Clear filters
            </Link>
          ) : null}
        </form>

        {data.rows.length === 0 ? (
          filtered ? (
            <EmptyScene title="No college matches these filters" body="Nothing fits this name and status. Clear the filters to see every college." next={{ label: "Clear filters", href: BASE }} />
          ) : (
            <EmptyScene title="No college has bought drive slots yet" body="A college appears here once a drive order is paid. Open Colleges to set one up." next={{ label: "Open colleges", href: "/admin/colleges" }} />
          )
        ) : (
          <>
            <div className="mb-3">
              <SlotLegend />
            </div>
            <Ledger
              caption="Drive slots by college"
              rows={data.rows}
              rowKey={(r) => r.collegeId}
              columns={[
                {
                  key: "college",
                  header: "College",
                  primary: true,
                  cell: (r) => (
                    <Link href={`/admin/colleges/${r.collegeId}`} className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      {r.name}
                    </Link>
                  ),
                  className: "w-[24%]",
                },
                { key: "bar", header: "Slots", cell: (r) => <SlotBar counts={r} scaleSlots={scale} />, className: "w-[30%] min-w-[9rem]" },
                { key: "slots", header: "Bought", align: "right", cell: (r) => n(r.slots) },
                { key: "issued", header: "Issued", align: "right", cell: (r) => n(r.issued) },
                { key: "act", header: "Activated", align: "right", cell: (r) => <span className="font-semibold">{n(split(r).activated)}</span> },
                { key: "not", header: "Not issued", align: "right", cell: (r) => n(split(r).notIssued) },
              ]}
              footer={[`All ${n(data.total)} ${data.total === 1 ? "college" : "colleges"}`, "", n(t.slots), n(t.issued), n(t.redeemed), n(t.unused)]}
            />
            <div className="[&>nav]:px-0">
              <Pager page={Math.min(page, pages)} pages={pages} total={data.total} perPage={pageSize} rowsShown={data.rows.length} params={pageParams} basePath={BASE} noun="colleges" />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
