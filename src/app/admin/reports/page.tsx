import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/panel";
import { RangeBar } from "@/components/admin/reports/range-bar";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { SectionSkeleton } from "@/components/admin/reports/skeletons";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { reportHref } from "@/lib/admin/reports/href";
import { REPORT_PANEL_ID, reportTabId } from "@/lib/admin/reports/tab-ids";
import { parseReportWindow, REPORT_TABS, TAB_LABELS } from "@/lib/admin/reports/window";

import EmployersTab from "./_tabs/employers";
import FinanceTab from "./_tabs/finance";
import InternsTab from "./_tabs/interns";
import OverviewTab from "./_tabs/overview";

export const metadata: Metadata = { title: "Reports" };

const SUBTITLE: Record<(typeof REPORT_TABS)[number], string> = {
  overview: "How the platform is growing, where hiring drops off, and what came in. Money comes after the funnel, detail last.",
  interns: "Every intern: where they are, what they know, how far they got.",
  employers: "Companies, their projects and proposals, and which skills employers ask for.",
  finance: "Money in and out: orders, activation fees, stipends, refunds, in rupees and dollars.",
};

/**
 * The Reports page: four tabs (Overview, Interns, Employers, Finance) over one shared period
 * (Today / This week / This month, the older presets, or custom dates). Tab and period live in
 * the URL (`?tab=interns&range=week`), so a link or a refresh lands in the same place. Each tab
 * is a server component whose sections stream behind their own Suspense boundary, so one slow
 * query never blocks the rest. Permission is the same `reports:read` gate as before
 * (proxy: /admin/reports); nothing here is cached, so a refund shows on the next load.
 */
export default async function AdminReportsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const now = new Date();
  const window = parseReportWindow(params, now);
  const tab = window.tab;
  const props = { window, params, now };
  // A new period or tab shows its own skeleton instead of holding the old content.
  const boundary = `${tab}|${window.kind}|${params.period ?? ""}|${params.from ?? ""}|${params.to ?? ""}`;

  return (
    <div className="space-y-5" data-rp="page">
      <AdminPageHeader title="Reports" subtitle={SUBTITLE[tab]} className="!mb-0 lg:!mb-0" />
      <ReportTabs
        active={tab}
        // Switching tab keeps the period but not the other tabs' filters and page numbers.
        items={REPORT_TABS.map((key) => ({
          key,
          label: TAB_LABELS[key],
          href: reportHref({ tab: key, range: params.range, period: params.period, from: params.from, to: params.to }, {}),
        }))}
      />
      <RangeBar window={window} params={params} resetKeys={RESET[tab]} />
      <div role="tabpanel" id={REPORT_PANEL_ID} aria-labelledby={reportTabId(tab)} tabIndex={-1} className="space-y-10 pt-3 outline-none lg:space-y-12">
        <Suspense key={boundary} fallback={<SectionSkeleton label={`Loading ${TAB_LABELS[tab]}`} strip />}>
          {tab === "overview" ? <OverviewTab {...props} /> : tab === "interns" ? <InternsTab {...props} /> : tab === "employers" ? <EmployersTab {...props} /> : <FinanceTab {...props} />}
        </Suspense>
      </div>
    </div>
  );
}

/** Query keys each tab owns for its tables (page numbers), dropped when the period changes. */
const RESET: Record<(typeof REPORT_TABS)[number], string[]> = {
  overview: ["hp"],
  interns: ["ipage"],
  employers: ["cpage"],
  finance: ["rows"],
};
