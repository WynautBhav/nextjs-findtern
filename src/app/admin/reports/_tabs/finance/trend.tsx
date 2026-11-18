import { Section } from "@/components/app/stat";
import { BarTrend } from "@/components/admin/money/rp-bars";
import { fillSeries } from "@/lib/admin/reports/growth";
import { loadFinanceTrend } from "@/lib/admin/reports/finance-load";
import { bucketLabel, trendSpec } from "@/lib/admin/reports/window";
import { formatMoney } from "@/lib/format";

import type { TabProps } from "../types";

const rs = (n: number) => formatMoney(n, "INR", { zeroLabel: "₹0" });
const money = (n: number) => (n === 0 ? "none" : rs(n));

/** Money received per day, week or month: the total as a bar, the employer and intern parts beside it, and how many rupee and dollar payments made it. */
export default async function Trend({ window: w, now }: TabProps) {
  const spec = trendSpec(w, now);
  const rows = await loadFinanceTrend(spec);
  const emp = fillSeries(spec.keys, rows, (r) => r.employerMinor + r.collegeMinor);
  const intern = fillSeries(spec.keys, rows, (r) => r.internMinor);
  const inrN = fillSeries(spec.keys, rows, (r) => r.inrCount);
  const usdN = fillSeries(spec.keys, rows, (r) => r.usdCount);
  return (
    <Section title={`Money received per ${spec.bucket}`} hint={`India time${spec.bucket === "week" ? ", weeks start Monday" : ""}. Employers include college seat sales. Payments are rupee / dollar.`}>
      <div data-rp="finance-trend">
        <BarTrend
          ariaLabel={`Money received per ${spec.bucket}`}
          bucket={spec.bucket}
          unit="collected"
          valueHeader="Collected"
          format={(n) => formatMoney(n, "INR", { short: true, zeroLabel: "₹0" })}
          rows={spec.keys.map((k, i) => ({ key: k, label: bucketLabel(k, spec.bucket), value: emp[i] + intern[i], display: rs(emp[i] + intern[i]) }))}
          extras={[
            { header: "Employers", cells: emp.map(money) },
            { header: "Interns", cells: intern.map(money) },
            { header: "Payments", cells: inrN.map((c, i) => (c + usdN[i] === 0 ? "none" : `${c} / ${usdN[i]}`)) },
          ]}
          lastIsPartial={!w.until}
          emptyText="No money was received in this stretch. Pick a longer period above."
        />
      </div>
    </Section>
  );
}
