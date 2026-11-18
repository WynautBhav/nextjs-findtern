import { Section } from "@/components/app/stat";
import { BarFunnel, RankGroup } from "@/components/admin/money/rp-bars";
import { LoadNote, windowWords } from "@/components/admin/money/rp-parts";
import { reportHref } from "@/lib/admin/reports/href";
import { acquisitionRows, signupVsPaid } from "@/lib/admin/reports/overview";
import { loadAcquisition, loadCohorts, type Acquisition, type Cohorts } from "@/lib/admin/reports/overview-load";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

/**
 * Of the people who signed up in the period, what each did since. A cohort, not a period total: the window picks who
 * signed up, the steps look at everything they have done so far. Each step counts on its own, so the captions say what
 * is counted and how it differs from the period figures above.
 */
export default async function Conversion({ window: w, params }: TabProps) {
  let co: Cohorts | null = null;
  let acq: Acquisition | null = null;
  try {
    [co, acq] = await Promise.all([loadCohorts(w), loadAcquisition(w)]);
  } catch (error) {
    console.error("[admin/reports/conversion] load failed", error);
  }
  const label = windowWords(w);
  if (!co || !acq) {
    return (
      <Section title="What new people did next">
        <LoadNote what="the sign-up cohorts" retryHref={reportHref(params, {})} />
      </Section>
    );
  }
  const sp = signupVsPaid({ signups: acq.signups, paidInWindow: 0, signedUpAndPaid: acq.signedUpAndPaid });
  const a = acquisitionRows(acq.signups, { college: acq.college, promo: acq.promo });
  const i = co.interns;
  const e = co.employers;

  return (
    <div className="space-y-10 lg:space-y-12" data-rp="overview-conversion">
      <div className="space-y-10 lg:space-y-12">
        <Section
          title="What new interns did next"
          hint={`The ${formatNumber(i.signups)} interns who signed up ${label}, and what they have done since. Each step is counted on its own, so one can be larger than the one before.${sp.signupToPaidPct === null ? "" : ` ${sp.signupToPaidPct}% have paid the activation fee.`}`}
        >
          <BarFunnel
            ariaLabel="New interns by what they did"
            unit="interns"
            firstNoun="interns who signed up"
            emptyText={`Nobody signed up ${label}. Pick a longer period above.`}
            steps={[
              { label: "Signed up", count: i.signups },
              { label: "Profile complete", count: i.profileComplete, hint: "Of everyone who signed up, including those who never opened the profile" },
              { label: "Has an offer from an employer", count: i.applied, hint: "Drafts left out" },
              { label: "Has been hired", count: i.hired, hint: "Hired at any date, so it can differ from hires counted by hire date" },
              { label: "Paid the activation fee", count: i.paid, hint: "The intern's own fee, not the employer's payment" },
            ]}
          />
        </Section>
        <Section title="What new employers did next" hint={`The ${formatNumber(e.signups)} employers who joined ${label}. Each step is counted on its own.`}>
          <BarFunnel
            ariaLabel="New employers by what they did"
            unit="employers"
            firstNoun="employers who joined"
            emptyText={`No employer joined ${label}. Pick a longer period above.`}
            steps={[
              { label: "Joined", count: e.signups },
              { label: "Company setup done", count: e.setupDone },
              { label: "Posted a project", count: e.posted },
              { label: "Sent a proposal", count: e.proposed, hint: "Drafts left out" },
              { label: "Paid an order", count: e.paid, hint: "At any time since joining; the figure above counts payments dated in the period" },
            ]}
          />
        </Section>
      </div>

      <Section
        title="Where new interns come from"
        hint={`${formatNumber(acq.signups)} interns signed up ${label}. Only what the database records: a college they joined, a promo code they used, the account type they chose. No ad, referral or "how did you hear" source is stored yet.`}
      >
        {acq.signups === 0 ? (
          <p className="border-y border-ink-200 py-4 text-sm text-ink-700">Nobody signed up {label}.</p>
        ) : (
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-3">
            <RankGroup
              title="Joined through a college"
              note={`${formatNumber(a.collegeTotal)} of ${formatNumber(acq.signups)}; ${formatNumber(a.direct)} not linked to a college`}
              rows={a.college.map((r) => ({ label: r.label, value: r.count, display: `${formatNumber(r.count)} · ${r.pct}%` }))}
              unit="interns"
              ariaLabel="Interns by college"
              emptyText="None joined through a college. Colleges invite interns from their drive page."
            />
            <RankGroup
              title="Used a promo code"
              note={`${formatNumber(a.promoTotal)} of ${formatNumber(acq.signups)}`}
              rows={a.promo.map((r) => ({ label: r.label, value: r.count, display: `${formatNumber(r.count)} · ${r.pct}%` }))}
              unit="interns"
              ariaLabel="Interns by promo code"
              emptyText="No promo code was used."
            />
            <RankGroup title="Account type" rows={acq.accountType.map((r) => ({ label: r.label, value: r.count }))} unit="interns" ariaLabel="Interns by account type" emptyText="None chosen." capitalize />
          </div>
        )}
      </Section>
    </div>
  );
}
