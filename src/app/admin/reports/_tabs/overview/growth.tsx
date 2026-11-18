import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { BarTrend } from "@/components/admin/money/rp-bars";
import { countOrNone, windowWords } from "@/components/admin/money/rp-parts";
import { fillSeries, growth } from "@/lib/admin/reports/growth";
import { loadOverviewCounts, loadOverviewTrend } from "@/lib/admin/reports/overview-load";
import { bucketLabel, trendSpec } from "@/lib/admin/reports/window";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

/** "12% up on the period before", "nothing in the period before", or nothing when there is no period before (all time). */
export function changeSentence(cur: number, prev: number | null): string {
  const g = growth(cur, prev);
  if (g.kind === "none") return "";
  if (g.kind === "new") return "None in the period before.";
  if (g.kind === "flat") return cur === 0 ? "" : "Same as the period before.";
  return `${g.label.replace("+", "Up ").replace("−", "Down ")} on the period before.`;
}

const count = countOrNone;
const cell = (n: number) => (n === 0 ? "none" : formatNumber(n));

/**
 * The first thing on Overview: ONE lead figure (new interns in the period) with the other growth figures as a quiet list,
 * then the month-by-month trend of the same. Interns pay an activation fee; employers pay when they hire. They are
 * different people paying different things, and each caption says which.
 */
export default async function Growth({ window: w, now }: TabProps) {
  const spec = trendSpec(w, now);
  const [c, trend] = await Promise.all([loadOverviewCounts(w, now), loadOverviewTrend(spec)]);
  const label = windowWords(w);
  const col = (key: "interns" | "employers" | "internPayers" | "employerPayers") => fillSeries(spec.keys, trend, (r) => r[key]);
  const interns = col("interns");
  const employers = col("employers");
  const internPayers = col("internPayers");
  const employerPayers = col("employerPayers");

  return (
    <div className="space-y-10 lg:space-y-12" data-rp="overview-growth">
      <Overview
        lead={
          <LeadStat
            label={`New interns, ${label}`}
            value={<RollingNumber value={c.internSignups.window} />}
            note={`Signed up ${label}; ${formatNumber(c.totalInterns)} interns on the platform in all. ${changeSentence(c.internSignups.window, c.internSignups.prev)}`.trim()}
          />
        }
        rest={
          <StatList
            items={[
              { label: "New employers", value: count(c.employerSignups.window), hint: `Joined ${label}; ${formatNumber(c.totalEmployers)} in all. ${changeSentence(c.employerSignups.window, c.employerSignups.prev)}`.trim() },
              { label: "Employers who paid an order", value: count(c.employerPayers.window), hint: `Paid an order ${label}, whenever they joined. ${changeSentence(c.employerPayers.window, c.employerPayers.prev)}`.trim() },
              {
                label: "Interns who paid the activation fee",
                value: count(c.internPayers.window),
                hint: `Interns pay this fee, employers pay when they hire. Counted by payment date ${label}, any signup date.`,
              },
            ]}
          />
        }
      />

      <Section title={`New interns per ${spec.bucket}`} hint={`India time${spec.bucket === "week" ? ", weeks start Monday" : ""}. Employers and payers beside each bar are the same ${spec.bucket}.`}>
        <BarTrend
          ariaLabel={`New interns per ${spec.bucket}`}
          bucket={spec.bucket}
          unit="new interns"
          valueHeader="New interns"
          rows={spec.keys.map((k, i) => ({ key: k, label: bucketLabel(k, spec.bucket), value: interns[i] }))}
          extras={[
            { header: "New employers", cells: employers.map(cell) },
            { header: "Interns paid", cells: internPayers.map(cell) },
            { header: "Employers paid", cells: employerPayers.map(cell) },
          ]}
          lastIsPartial={!w.until}
          emptyText="Nobody signed up in this stretch. Pick a longer period above to see earlier months."
        />
      </Section>
    </div>
  );
}
