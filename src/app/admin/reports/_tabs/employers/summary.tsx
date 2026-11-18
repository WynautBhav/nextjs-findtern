import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { BarTrend } from "@/components/admin/money/rp-bars";
import { countOrNone, windowWords } from "@/components/admin/money/rp-parts";
import { loadEmployerSummary, loadEmployerTrend } from "@/lib/admin/reports/employers-load";
import { fillSeries } from "@/lib/admin/reports/growth";
import { bucketLabel, trendSpec } from "@/lib/admin/reports/window";
import { formatNumber } from "@/lib/format";

import { changeSentence } from "../overview/growth";
import type { TabProps } from "../types";

const count = countOrNone;
const cell = (n: number) => (n === 0 ? "none" : formatNumber(n));

/** Employers: one lead figure (new employers in the period), the quiet list, and the trend of employers and projects. */
export default async function Summary({ window: w, now }: TabProps) {
  const spec = trendSpec(w, now);
  const [{ counts: c, proposals: p, projects }, trend] = await Promise.all([loadEmployerSummary(w, now), loadEmployerTrend(spec)]);
  const label = windowWords(w);
  const emps = fillSeries(spec.keys, trend, (r) => r.employers);
  const projs = fillSeries(spec.keys, trend, (r) => r.projects);
  const status = [`${formatNumber(p.accepted)} accepted`, `${formatNumber(p.rejected)} rejected`, `${formatNumber(p.pending)} pending`, `${formatNumber(p.expired)} expired`, ...(p.withdrawn ? [`${formatNumber(p.withdrawn)} withdrawn`] : [])].join(", ");

  return (
    <div className="space-y-10 lg:space-y-12" data-rp="employers-summary">
      <Overview
        lead={<LeadStat label={`New employers, ${label}`} value={<RollingNumber value={c.newWindow} />} note={`Joined ${label}; ${formatNumber(c.total)} employers in all, ${formatNumber(c.withLive)} with a live project now. ${changeSentence(c.newWindow, c.newPrev)}`.trim()} />}
        rest={
          <StatList
            items={[
              { label: "Active employers", value: count(c.activeWindow), hint: `Posted a project or sent a proposal ${label}. ${changeSentence(c.activeWindow, c.activePrev)}`.trim() },
              { label: "Projects posted", value: count(projects.createdWindow), hint: `Posted ${label}. ${changeSentence(projects.createdWindow, projects.createdPrev)}`.trim() },
              { label: "Proposals sent", value: count(p.sent), hint: `Sent ${label} (drafts left out): ${status}.` },
            ]}
          />
        }
      />
      <Section title={`New employers and projects per ${spec.bucket}`} hint={`India time${spec.bucket === "week" ? ", weeks start Monday" : ""}.`}>
        <BarTrend
          ariaLabel={`New employers and projects posted per ${spec.bucket}`}
          bucket={spec.bucket}
          unit="new employers"
          valueHeader="New employers"
          rows={spec.keys.map((k, i) => ({ key: k, label: bucketLabel(k, spec.bucket), value: emps[i] }))}
          extras={[{ header: "Projects posted", cells: projs.map(cell) }]}
          lastIsPartial={!w.until}
          emptyText="No employer joined and no project was posted in this stretch. Pick a longer period above."
        />
      </Section>
    </div>
  );
}
