import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { BarFunnel, BarTrend } from "@/components/admin/money/rp-bars";
import { countOrNone, windowWords } from "@/components/admin/money/rp-parts";
import { fillSeries } from "@/lib/admin/reports/growth";
import { INTERN_STAGES, STAGE_LABEL } from "@/lib/admin/reports/interns";
import { loadInternSummary, loadInternTrend } from "@/lib/admin/reports/interns-load";
import { bucketLabel, trendSpec } from "@/lib/admin/reports/window";
import { formatNumber } from "@/lib/format";

import { changeSentence } from "../overview/growth";
import type { TabProps } from "../types";

const count = countOrNone;

/** Interns: one lead figure (new interns in the period), the quiet list, the trend, where every intern is now, and account status. */
export default async function Summary({ window: w, now }: TabProps) {
  const spec = trendSpec(w, now);
  const [{ counts: c, apps: a }, trend] = await Promise.all([loadInternSummary(w, now), loadInternTrend(spec)]);
  const series = fillSeries(spec.keys, trend, (r) => r.n);
  // Furthest-step buckets -> "reached at least this step", so a step is never wider than the one above.
  const reached = INTERN_STAGES.map((s, i) => ({
    label: STAGE_LABEL[s],
    count: INTERN_STAGES.slice(i).reduce((sum, later) => sum + (c.stages[later] ?? 0), 0),
  }));
  const label = windowWords(w);

  return (
    <div className="space-y-10 lg:space-y-12" data-rp="interns-summary">
      <Overview
        lead={<LeadStat label={`New interns, ${label}`} value={<RollingNumber value={c.newWindow} />} note={`Signed up ${label}; ${formatNumber(c.total)} interns in all. ${changeSentence(c.newWindow, c.newPrev)}`.trim()} />}
        rest={
          <StatList
            items={[
              { label: "Applications", value: count(a.win), hint: `Offers sent to interns ${label} (drafts left out), to ${formatNumber(a.winInterns)} ${a.winInterns === 1 ? "intern" : "interns"}. ${changeSentence(a.win, a.prev)}`.trim() },
              { label: "Hired", value: count(c.hired), hint: `Of all ${formatNumber(c.total)} interns, hired at any date, whatever the period.` },
              { label: "Verified by an admin", value: count(c.approved), hint: `KYC details given: ${formatNumber(c.kyc)}. Email verified: ${formatNumber(c.emailVerified)}.` },
            ]}
          />
        }
      />

      <Section title={`New interns per ${spec.bucket}`} hint={`India time${spec.bucket === "week" ? ", weeks start Monday" : ""}.`}>
        <BarTrend
          ariaLabel={`New interns per ${spec.bucket}`}
          bucket={spec.bucket}
          unit="new interns"
          valueHeader="New interns"
          rows={spec.keys.map((k, i) => ({ key: k, label: bucketLabel(k, spec.bucket), value: series[i] }))}
          lastIsPartial={!w.until}
          emptyText="Nobody signed up in this stretch. Pick a longer period above."
        />
      </Section>

      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Where interns are" hint="Everyone, all time. Each intern sits at the furthest step reached, so a step is never wider than the one above.">
          <BarFunnel ariaLabel="Interns by furthest step reached" unit="interns" firstNoun="interns" steps={reached} emptyText="No intern has signed up yet." />
          <p className="mt-3 text-sm text-ink-700">
            A step counts everyone who reached it or a later one, so Paid activation can be larger than the {formatNumber(c.paid)} interns with a paid fee on record: the others were scored or sent offers without one.
          </p>
        </Section>
        <Section title="Account status" hint="All interns, all time. Banned and admin-hidden interns are included and labelled in the table.">
          <StatList
            items={[
              { label: "Active", value: count(c.active) },
              { label: "Hidden by an admin", value: count(c.hidden) },
              { label: "Banned", value: count(c.banned) },
              { label: "Switched off by the intern", value: count(c.inactive) },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
