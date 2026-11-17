import { ChartCard } from "@/components/admin/reports/chart-card";
import { fillSeries } from "@/lib/admin/reports/growth";
import { loadFinanceTrend } from "@/lib/admin/reports/finance-load";
import { bucketLabel, trendSpec } from "@/lib/admin/reports/window";

import type { TabProps } from "../types";

/** Collected per day, week or month, split employer and intern; and how many rupee and dollar payments came in. */
export default async function Trend({ window: w, now }: TabProps) {
  const spec = trendSpec(w, now);
  const rows = await loadFinanceTrend(spec);
  const points = (ys: number[]) => spec.keys.map((k, i) => ({ x: bucketLabel(k, spec.bucket), y: ys[i] }));
  const emp = fillSeries(spec.keys, rows, (r) => r.employerMinor + r.collegeMinor);
  const intern = fillSeries(spec.keys, rows, (r) => r.internMinor);
  const inrN = fillSeries(spec.keys, rows, (r) => r.inrCount);
  const usdN = fillSeries(spec.keys, rows, (r) => r.usdCount);
  const note = `Per ${spec.bucket} in India time${spec.bucket === "week" ? ", weeks start Monday" : ""}.`;
  return (
    <div data-rp="finance-trend">
      <ChartCard
        views={[
          {
            key: "collected",
            tab: "Collected",
            title: "Money received",
            note: `${note} Employers include college seat sales.`,
            unit: "Rupees",
            format: "inr",
            series: [
              { label: "From employers", tone: "current", points: points(emp) },
              { label: "From interns", tone: "previous", points: points(intern) },
            ],
          },
          {
            key: "currency",
            tab: "Rupee and dollar payments",
            title: "Payments received by currency",
            note,
            unit: "Payments",
            format: "count",
            series: [
              { label: "Rupee payments", tone: "current", points: points(inrN) },
              { label: "Dollar payments", tone: "previous", points: points(usdN) },
            ],
          },
        ]}
      />
    </div>
  );
}
