import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { RankCard } from "@/components/admin/reports/rank-card";
import { acquisitionRows, conversionRows, signupVsPaid } from "@/lib/admin/reports/overview";
import { loadAcquisition, loadCohorts } from "@/lib/admin/reports/overview-load";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { TabProps } from "../types";

function Bars({ rows, label }: { rows: { label: string; count: number; pct: number }[]; label: string }) {
  return (
    <ul aria-label={label} className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-foreground">{r.label}</span>
            <span className="nums shrink-0 text-right text-text-subtle">
              <b className="font-semibold text-foreground">{formatNumber(r.count)}</b> · {r.pct}%
            </span>
          </div>
          <div aria-hidden className="mt-1 h-2 overflow-hidden rounded-full bg-[color:var(--admin-panel-2)]">
            <div className={cn("h-full rounded-full bg-[color:var(--admin-tile)]", r.count > 0 && "min-w-1.5")} style={{ width: `${r.pct}%`, opacity: 1 - i * 0.1 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Conversion of the period's signups, and where the interns came from (only what the database records). */
export default async function Conversion({ window: w }: TabProps) {
  const [co, acq] = await Promise.all([loadCohorts(w), loadAcquisition(w)]);
  const label = w.kind === "all" ? "all time" : w.label.toLowerCase();
  const i = conversionRows([
    { label: "Signed up", count: co.interns.signups },
    { label: "Profile complete", count: co.interns.profileComplete },
    { label: "Applied / has a proposal", count: co.interns.applied },
    { label: "Hired", count: co.interns.hired },
    { label: "Paid the activation fee (money received)", count: co.interns.paid },
  ]);
  const e = conversionRows([
    { label: "Signed up", count: co.employers.signups },
    { label: "Company setup done", count: co.employers.setupDone },
    { label: "Posted a project", count: co.employers.posted },
    { label: "Sent a proposal", count: co.employers.proposed },
    { label: "Paid an order", count: co.employers.paid },
  ]);
  const sp = signupVsPaid({ signups: acq.signups, paidInWindow: 0, signedUpAndPaid: acq.signedUpAndPaid });
  const a = acquisitionRows(acq.signups, { college: acq.college, promo: acq.promo });

  return (
    <div className="space-y-5 lg:space-y-6" data-rp="overview-conversion">
      <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="What new interns did"
            description={`Of the ${formatNumber(co.interns.signups)} interns who signed up ${label}. Each step counts on its own, so paid can be bigger than hired.${sp.signupToPaidPct === null ? "" : ` ${sp.signupToPaidPct}% of them have paid.`}`}
          />
          <PanelBody>
            {co.interns.signups === 0 ? <p className="py-8 text-center text-sm text-text-subtle">Nobody signed up in this period.</p> : <Bars rows={i} label="New interns by what they did" />}
            {co.interns.signups === 0 ? null : (
              <p className="nums mt-4 text-sm text-text-subtle">
                Activated free (a promo or waiver code, a college, or marked paid by an admin, no money received): <b className="font-semibold text-foreground">{formatNumber(co.interns.activatedFree)}</b>
              </p>
            )}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="What new employers did" description={`Of the ${formatNumber(co.employers.signups)} employers who joined ${label}. Each step counts on its own.`} />
          <PanelBody>
            {co.employers.signups === 0 ? <p className="py-8 text-center text-sm text-text-subtle">No employer joined in this period.</p> : <Bars rows={e} label="New employers by what they did" />}
          </PanelBody>
        </Panel>
      </div>

      <RankCard
        title="Where new interns come from"
        description={`${formatNumber(acq.signups)} interns signed up ${label}. Only what the database records: a college they joined, a promo code they used, and the account type they chose. No ad, referral or "how did you hear" source is stored yet.`}
        empty="Nobody signed up in this period."
        groups={[
          { title: "Joined through a college", note: `${formatNumber(a.collegeTotal)} of ${formatNumber(acq.signups)} · ${formatNumber(a.direct)} not linked to a college`, rows: a.college.map((r) => ({ label: r.label, value: r.count, display: `${formatNumber(r.count)} · ${r.pct}%` })) },
          { title: "Used a promo code", note: `${formatNumber(a.promoTotal)} of ${formatNumber(acq.signups)}`, rows: a.promo.map((r) => ({ label: r.label, value: r.count, display: `${formatNumber(r.count)} · ${r.pct}%` })) },
          { title: "Account type", rows: acq.accountType.map((r) => ({ label: r.label, value: r.count })), capitalize: true },
        ]}
      />
    </div>
  );
}
