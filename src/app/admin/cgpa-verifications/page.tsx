import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { CgpaExport } from "@/components/admin/cgpa/export-button";
import { CgpaRows } from "@/components/admin/cgpa/rows";
import { AdminEmpty, AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { buttonClass } from "@/components/ui/button";
import { CGPA_FILTERS, countsByFilter, matchesFilter, searchRows, sortRows, type CgpaFilter } from "@/lib/admin/cgpa-queue";
import { loadCgpaQueue } from "@/lib/admin/cgpa-queue-load";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { canWrite as mayWrite } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EMPTY: Record<CgpaFilter, { title: string; body: string }> = {
  pending: { title: "Nothing to verify", body: "Candidates who pick a semester and enter a score appear here, and the 24 to 48 hour clock starts when they accept an offer." },
  overdue: { title: "Nothing overdue", body: "Every pending check is inside its 48 hour window." },
  verified: { title: "No verified checks yet", body: "Checks you mark correct are listed here." },
  incorrect: { title: "No corrections yet", body: "Checks you mark incorrect, with the corrected score, are listed here." },
};

/** Candidates waiting on Findtern to check their CGPA against their proofs, with the clock from the offer they accepted. */
export default async function CgpaVerificationsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const filter: CgpaFilter = CGPA_FILTERS.find((f) => f.key === params.filter)?.key ?? "pending";
  const q = (params.q ?? "").trim();
  const session = await getSession();
  const canWrite = mayWrite(session?.permissions, "/admin/cgpa-verifications");
  const now = new Date();

  let all: Awaited<ReturnType<typeof loadCgpaQueue>>;
  try {
    all = await loadCgpaQueue();
  } catch (error) {
    console.error("[admin/cgpa-verifications] load failed", error);
    return (
      <div>
        <AdminPageHeader title="CGPA checks" subtitle="Candidates waiting for Findtern to verify their CGPA." />
        <Panel>
          <AdminLoadError what="the CGPA checks" retryHref="/admin/cgpa-verifications" />
        </Panel>
      </div>
    );
  }

  const counts = countsByFilter(all, now);
  const rows = sortRows(searchRows(all, q).filter((r) => matchesFilter(r, filter, now)), filter);
  const href = (f: CgpaFilter) => `/admin/cgpa-verifications?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div>
      <AdminPageHeader
        title="CGPA checks"
        subtitle={
          counts.pending === 0
            ? "No candidate is waiting for a CGPA check."
            : `${counts.pending} candidate${counts.pending === 1 ? "" : "s"} waiting${counts.overdue ? `, ${counts.overdue} overdue` : ""}.`
        }
      />
      <TableToolbar searchPlaceholder="Name, college, company, phone or email" extra={<CgpaExport rows={rows} now={now.toISOString()} />} />
      <nav aria-label="Filter" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {CGPA_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href(f.key)}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn(buttonClass({ variant: f.key === filter ? "primary" : "outline", size: "sm" }), "min-h-11")}
          >
            {f.label}
            <span className="nums ml-1.5 opacity-80">{counts[f.key]}</span>
          </Link>
        ))}
      </nav>
      <p className="mb-3 text-sm text-text-subtle">
        The clock starts when the candidate accepts an offer: green for the first 24 hours, amber until hour 48, red after that. Amber start dates are under 48 hours away.
      </p>
      <Panel>
        {rows.length === 0 ? (
          <AdminEmpty icon={ClipboardCheck} title={q ? "Nothing matches" : EMPTY[filter].title} body={q ? "No check in this view matches that search." : EMPTY[filter].body} />
        ) : (
          <CgpaRows rows={rows} now={now} canWrite={canWrite} />
        )}
      </Panel>
    </div>
  );
}
