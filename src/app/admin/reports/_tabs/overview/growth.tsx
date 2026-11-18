import { Panel, PanelHeader } from "@/components/admin/panel";
import { ChartCard } from "@/components/admin/reports/chart-card";
import { SimpleTable } from "@/components/admin/reports/simple-table";
import { StatStrip } from "@/components/admin/reports/stat-strip";
import { fillSeries, growth, statDelta } from "@/lib/admin/reports/growth";
import { loadOverviewCounts, loadOverviewTrend } from "@/lib/admin/reports/overview-load";
import { signupVsPaid } from "@/lib/admin/reports/overview";
import { bucketLabel, trendSpec } from "@/lib/admin/reports/window";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

/** Platform growth: new interns and employers, who signed up vs who paid, the trend with change on the period before. */
export default async function Growth({ window: w, now }: TabProps) {
  const spec = trendSpec(w, now);
  const [c, trend] = await Promise.all([loadOverviewCounts(w, now), loadOverviewTrend(spec)]);
  const label = w.kind === "all" ? "all time" : w.label.toLowerCase();
  const points = (key: "interns" | "employers" | "internPayers" | "employerPayers") => {
    const ys = fillSeries(spec.keys, trend, (r) => r[key]);
    return spec.keys.map((k, i) => ({ x: bucketLabel(k, spec.bucket), y: ys[i] }));
  };
  const note = `Per ${spec.bucket} in India time${spec.bucket === "week" ? ", weeks start Monday" : ""}.`;
  const rows: [string, keyof typeof c][] = [
    ["New interns", "internSignups"],
    ["New employers", "employerSignups"],
    ["Interns who paid the activation fee", "internPayers"],
    ["Employers who paid an order", "employerPayers"],
  ];
  const sp = signupVsPaid({ signups: c.internSignups.window, paidInWindow: c.internPayers.window, signedUpAndPaid: 0 });

  return (
    <div className="space-y-5 lg:space-y-6" data-rp="overview-growth">
      <StatStrip
        label="Platform growth"
        stats={[
          { label: "New interns", value: formatNumber(c.internSignups.window), note: `signed up ${label} · ${formatNumber(c.totalInterns)} in all`, accent: true, ...statDelta(c.internSignups.window, c.internSignups.prev) },
          { label: "New employers", value: formatNumber(c.employerSignups.window), note: `joined ${label} · ${formatNumber(c.totalEmployers)} in all`, ...statDelta(c.employerSignups.window, c.employerSignups.prev) },
          { label: "Interns who paid the activation fee", value: formatNumber(sp.paidInWindow), note: `paid the activation fee ${label} (any signup date; ${formatNumber(sp.signups)} signed up ${label})`, ...statDelta(c.internPayers.window, c.internPayers.prev) },
          { label: "Employers who paid", value: formatNumber(c.employerPayers.window), note: `placed a paid order ${label}`, ...statDelta(c.employerPayers.window, c.employerPayers.prev) },
        ]}
      />

      <Panel>
        <PanelHeader title="Today, this week, this month" description="Always these three, whatever period is picked above (India time, week from Monday)." />
        <SimpleTable
          caption="Growth by day, week and month"
          head={["", "Today", "This week", "This month", `${w.label} vs before`]}
          right={[1, 2, 3, 4]}
          minWidth="lg:min-w-[30rem]"
          maxHeight="max-h-none"
          rows={rows.map(([name, key]) => {
            const p = c[key] as typeof c.internSignups;
            const g = growth(p.window, p.prev);
            return [name, formatNumber(p.today), formatNumber(p.week), formatNumber(p.month), g.kind === "none" ? "-" : `${formatNumber(p.window)} (${g.label})`];
          })}
          empty={{ title: "No data", body: "Nothing to show yet." }}
        />
      </Panel>

      <ChartCard
        views={[
          {
            key: "signups",
            tab: "Signups",
            title: "Is the platform growing?",
            note: `New interns and new employers. ${note}`,
            unit: "New signups",
            format: "count",
            series: [
              { label: "New interns", tone: "current", points: points("interns") },
              { label: "New employers", tone: "previous", points: points("employers") },
            ],
          },
          {
            key: "paid",
            tab: "Who paid",
            title: "Who is paying?",
            note: `Interns who paid the activation fee and employers who paid an order. ${note}`,
            unit: "Payers",
            format: "count",
            series: [
              { label: "Interns who paid", tone: "current", points: points("internPayers") },
              { label: "Employers who paid", tone: "previous", points: points("employerPayers") },
            ],
          },
        ]}
      />
    </div>
  );
}
