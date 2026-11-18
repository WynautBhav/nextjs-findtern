import { ChartCard } from "@/components/admin/reports/chart-card";
import { StatStrip } from "@/components/admin/reports/stat-strip";
import { loadEmployerSummary, loadEmployerTrend } from "@/lib/admin/reports/employers-load";
import { fillSeries, statDelta } from "@/lib/admin/reports/growth";
import { bucketLabel, trendSpec } from "@/lib/admin/reports/window";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

export default async function Summary({ window: w, now }: TabProps) {
  const spec = trendSpec(w, now);
  const [{ counts: c, proposals: p, projects }, trend] = await Promise.all([loadEmployerSummary(w, now), loadEmployerTrend(spec)]);
  const label = w.kind === "all" ? "all time" : w.label.toLowerCase();
  const emps = fillSeries(spec.keys, trend, (r) => r.employers);
  const projs = fillSeries(spec.keys, trend, (r) => r.projects);
  const points = (ys: number[]) => spec.keys.map((k, i) => ({ x: bucketLabel(k, spec.bucket), y: ys[i] }));

  return (
    <div className="space-y-5 lg:space-y-6" data-rp="employers-summary">
      <StatStrip
        label="Employer figures"
        stats={[
          { label: "Employers", value: formatNumber(c.total), note: `${formatNumber(c.withLive)} have a live project now` },
          { label: "New employers", value: formatNumber(c.newWindow), note: `joined ${label}`, accent: true, ...statDelta(c.newWindow, c.newPrev) },
          { label: "Today / week / month", value: `${formatNumber(c.today)} / ${formatNumber(c.week)} / ${formatNumber(c.month)}`, note: "new employers (India time, week from Monday)" },
          { label: "Active employers", value: formatNumber(c.activeWindow), note: `posted a project or sent a proposal ${label}`, ...statDelta(c.activeWindow, c.activePrev) },
          { label: "Projects posted", value: formatNumber(projects.createdWindow), note: label, ...statDelta(projects.createdWindow, projects.createdPrev) },
          { label: "Proposals sent", value: formatNumber(p.sent), note: `${formatNumber(p.accepted)} accepted · ${formatNumber(p.rejected)} rejected · ${formatNumber(p.pending)} pending · ${formatNumber(p.expired)} expired${p.withdrawn ? ` · ${formatNumber(p.withdrawn)} withdrawn` : ""}` },
        ]}
      />
      <ChartCard
        views={[
          {
            key: "growth",
            tab: "Employers and projects",
            title: "New employers and projects posted",
            note: `Per ${spec.bucket} in India time${spec.bucket === "week" ? ", weeks start Monday" : ""}.`,
            unit: "Count",
            format: "count",
            series: [
              { label: "New employers", tone: "current", points: points(emps) },
              { label: "Projects posted", tone: "previous", points: points(projs) },
            ],
          },
        ]}
      />
    </div>
  );
}
