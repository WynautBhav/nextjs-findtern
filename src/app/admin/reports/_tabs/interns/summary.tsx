import { ChartCard } from "@/components/admin/reports/chart-card";
import { Funnel } from "@/components/admin/reports/funnel";
import { StatStrip } from "@/components/admin/reports/stat-strip";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { fillSeries, statDelta } from "@/lib/admin/reports/growth";
import { INTERN_STAGES, STAGE_LABEL } from "@/lib/admin/reports/interns";
import { loadInternSummary, loadInternTrend } from "@/lib/admin/reports/interns-load";
import { bucketLabel, trendSpec } from "@/lib/admin/reports/window";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "0%");

export default async function Summary({ window: w, now }: TabProps) {
  const spec = trendSpec(w, now);
  const [{ counts: c, apps: a }, trend] = await Promise.all([loadInternSummary(w, now), loadInternTrend(spec)]);
  const series = fillSeries(spec.keys, trend, (r) => r.n);
  // Furthest-step buckets -> "reached at least this step", so a step is never wider than the one above.
  const reached = INTERN_STAGES.map((s, i) => ({
    label: STAGE_LABEL[s],
    count: INTERN_STAGES.slice(i).reduce((sum, later) => sum + (c.stages[later] ?? 0), 0),
  }));
  const label = w.kind === "all" ? "all time" : w.label.toLowerCase();

  return (
    <div className="space-y-5 lg:space-y-6" data-rp="interns-summary">
      <StatStrip
        label="Intern figures"
        stats={[
          { label: "New interns", value: formatNumber(c.newWindow), note: `signed up ${label}`, accent: true, ...statDelta(c.newWindow, c.newPrev) },
          { label: "Today / week / month", value: `${formatNumber(c.today)} / ${formatNumber(c.week)} / ${formatNumber(c.month)}`, note: "new interns (India time, week from Monday)" },
          { label: "Applications", value: formatNumber(a.win), note: `from ${formatNumber(a.winInterns)} ${a.winInterns === 1 ? "intern" : "interns"} ${label}`, ...statDelta(a.win, a.prev) },
          { label: "Applications this week / month", value: `${formatNumber(a.week)} / ${formatNumber(a.month)}`, note: `by ${formatNumber(a.weekInterns)} / ${formatNumber(a.monthInterns)} distinct interns` },
          { label: "Hired / not hired", value: `${formatNumber(c.hired)} / ${formatNumber(Math.max(0, c.total - c.hired))}`, note: `${pct(c.hired, c.total)} of ${formatNumber(c.total)} interns hired` },
          { label: "Verified", value: formatNumber(c.approved), note: `admin-approved. KYC details given: ${formatNumber(c.kyc)}. Email verified: ${formatNumber(c.emailVerified)}` },
        ]}
      />

      <ChartCard
        views={[
          {
            key: "new",
            tab: "New interns",
            title: "New interns",
            note: `Signups per ${spec.bucket} in India time${spec.bucket === "week" ? ", weeks start Monday" : ""}.`,
            unit: "Interns",
            format: "count",
            series: [{ label: "New interns", tone: "current", points: spec.keys.map((k, i) => ({ x: bucketLabel(k, spec.bucket), y: series[i] })) }],
          },
        ]}
      />

      <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Where interns are" description="Interns who reached each step or a later one (everyone, all time). Each intern sits at the furthest step reached, so a step is never wider than the one above." />
          <PanelBody>
            <Funnel ariaLabel="Interns by furthest step reached" steps={reached} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Account status" description="All interns, all time. Banned and admin-hidden interns are included here and labelled in the table." />
          <PanelBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              {[
                ["Active", c.active],
                ["Hidden by admin", c.hidden],
                ["Banned", c.banned],
                ["Switched off (inactive)", c.inactive],
                ["Total interns", c.total],
                ["Paid activation", c.paid],
                ["AI interview scored", c.scored],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-text-subtle">{k}</dt>
                  <dd className="nums mt-0.5 text-xl font-semibold text-foreground">{formatNumber(v as number)}</dd>
                </div>
              ))}
            </dl>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
