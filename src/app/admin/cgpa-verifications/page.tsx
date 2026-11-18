import { CgpaExport } from "@/components/admin/cgpa/export-button";
import { CgpaRows, waitedFor } from "@/components/admin/cgpa/rows";
import { AdminEmpty, AdminLoadError, AdminPageHeader, PageLead, Panel } from "@/components/admin/panel";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { FilterTabs } from "@/components/app/primitives";
import { CGPA_FILTERS, countsByFilter, matchesFilter, searchRows, sortRows, type CgpaFilter } from "@/lib/admin/cgpa-queue";
import { loadCgpaQueue } from "@/lib/admin/cgpa-queue-load";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { canWrite as mayWrite } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const EMPTY: Record<CgpaFilter, { title: string; body: string; next?: { label: string; href: string } }> = {
  pending: {
    title: "Nothing to verify",
    body: "Candidates who pick a semester and enter a score appear here, and the 24 to 48 hour clock starts when they accept an offer.",
    next: { label: "See candidates", href: "/admin/interns" },
  },
  overdue: { title: "Nothing overdue", body: "Every pending check is inside its 48 hour window.", next: { label: "Open pending checks", href: "/admin/cgpa-verifications" } },
  verified: { title: "No verified checks yet", body: "Checks you mark correct are listed here.", next: { label: "Open pending checks", href: "/admin/cgpa-verifications" } },
  incorrect: { title: "No corrections yet", body: "Checks you mark incorrect, with the corrected score, are listed here.", next: { label: "Open pending checks", href: "/admin/cgpa-verifications" } },
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
        <AdminPageHeader title="CGPA checks" />
        <Panel>
          <AdminLoadError what="the CGPA checks" retryHref="/admin/cgpa-verifications" />
        </Panel>
      </div>
    );
  }

  const counts = countsByFilter(all, now);
  const rows = sortRows(searchRows(all, q).filter((r) => matchesFilter(r, filter, now)), filter);
  const href = (f: CgpaFilter) => `/admin/cgpa-verifications?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  // The lead: how many are waiting and how long the oldest has waited (the queue is sorted by it).
  const pending = all.filter((r) => r.status === "pending");
  const oldest = pending.flatMap((r) => {
    const w = waitedFor(r, now);
    return w ? [{ name: r.name, w }] : [];
  }).sort((a, b) => b.w.hours - a.w.hours)[0];
  const oldestText = oldest ? `Oldest has waited ${oldest.w.label} ${oldest.w.unit === "days" && oldest.w.label === "1" ? "day" : oldest.w.unit}${counts.overdue ? `; ${counts.overdue} ${counts.overdue === 1 ? "is" : "are"} past the 48 hour window` : ""}.` : "None has an accepted offer yet, so no clock is running.";

  return (
    <div>
      <AdminPageHeader title="CGPA checks" action={<CgpaExport rows={rows} now={now.toISOString()} />} />
      <PageLead
        value={counts.pending}
        label={counts.pending === 1 ? "check waiting" : "checks waiting"}
        note={counts.pending === 0 ? "No candidate is waiting for a CGPA check." : oldestText}
        tone={counts.overdue ? "signal" : "ink"}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          label="CGPA check views"
          value={filter}
          hrefFor={(k) => href(k as CgpaFilter)}
          tabs={CGPA_FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] }))}
        />
        <div className="w-full min-w-0 sm:w-80">
          <TableToolbar searchPlaceholder="Name, college or company" />
        </div>
      </div>
      <p className="mb-3 max-w-3xl text-sm text-ink-700">
        Pending checks are listed oldest first. The clock starts when the candidate accepts an offer: under 24 hours is fine, until hour 48 is amber, after that is overdue. Start dates under 48 hours away are flagged.
      </p>
      <Panel>
        {rows.length === 0 ? (
          <AdminEmpty title={q ? "Nothing matches" : EMPTY[filter].title} body={q ? "No check in this view matches that search." : EMPTY[filter].body} action={q ? { href: href(filter).replace(/&q=.*$/, ""), label: "Clear the search" } : EMPTY[filter].next} />
        ) : (
          <CgpaRows rows={rows} now={now} canWrite={canWrite} />
        )}
      </Panel>
    </div>
  );
}
