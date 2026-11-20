import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { formatDate, formatMoney, shortDate } from "@/lib/format";
import type { EngagementEarnings } from "@/lib/earnings-view";

import type { HireBonus } from "./bonus";
import { MonthRail } from "./month-rail";
import { STIPEND_CURRENCY, type StipendPlan } from "./months";

const date = (d: Date) => shortDate(d, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const BONUS_STATE = {
  paid: { label: "Paid", tone: "paid" },
  pending: { label: "Scheduled", tone: "waiting" },
  failed: { label: "Failed", tone: "closed" },
} as const;

/** The completion bonus for this hire, apart from the stipend: amount, status and date. Renders nothing without one. */
function BonusRows({ bonus }: { bonus?: HireBonus }) {
  if (!bonus || bonus.entries.length === 0) return null;
  return (
    <ul aria-label="Completion bonus" className="mt-3 space-y-1.5 rounded-lg bg-brand-50/60 px-3 py-2.5">
      {bonus.entries.map((e) => {
        const s = e.state ? BONUS_STATE[e.state] : { label: "Recorded", tone: "neutral" as const };
        const when = e.state === "paid" ? (e.when ? `Paid ${date(e.when)}` : null) : e.state === "pending" ? (e.when ? `Due ${date(e.when)}` : "Date to be set") : null;
        return (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-brand-800">Completion bonus</span>
            <span className="nums font-semibold text-ink-900">{formatMoney(e.amountMinor, STIPEND_CURRENCY, { zeroLabel: false })}</span>
            <Pill tone={s.tone}>{s.label}</Pill>
            {when ? <span className="nums text-xs text-ink-600">{when}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** One hired internship on the Stipend page: stipend progress, its completion bonus when it has one, and the month rail. */
export function Engagement({ card, plan, bonus }: { card: EngagementEarnings; plan: StipendPlan | null; bonus?: HireBonus }) {
  const description = `${card.company} · ${card.months} month${card.months === 1 ? "" : "s"}${card.joiningDate ? ` from ${formatDate(card.joiningDate)}` : ""}`;
  const title = (
    <div className="min-w-0">
      <Link
        href={`/intern/proposals/${encodeURIComponent(card.proposalId)}`}
        className="inline-flex min-h-11 items-center text-[15px] font-semibold text-ink-900 underline-offset-4 hover:text-brand-800 hover:underline sm:min-h-0 touch:min-h-11"
      >
        {card.roleTitle}
        <span className="sr-only">: open the offer</span>
      </Link>
      <p className="nums text-sm text-ink-600">{description}</p>
    </div>
  );

  if (!plan) {
    return (
      <li className="py-5">
        {title}
        <p className="mt-2 max-w-prose text-pretty text-sm text-text-subtle">
          {!card.eligible
            ? "Candidates with a Findtern Score below 6 are not paid a stipend. A higher score makes later internships paid."
            : "The monthly stipend is not set on this offer, so there is nothing to track here yet."}
        </p>
        <BonusRows bonus={bonus} />
      </li>
    );
  }

  const pct = (n: number) => (plan.totalMinor > 0 ? `${(n / plan.totalMinor) * 100}%` : "0%");
  const current = plan.months.some((m) => m.current);
  return (
    <li className="py-5">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-start">
        {title}
        <div className="sm:text-right">
          {plan.paidMinor > 0 ? (
            <>
              <p className="nums text-sm text-ink-600">
                <span className="text-base font-semibold text-ink-900">{formatMoney(plan.paidMinor, STIPEND_CURRENCY, { zeroLabel: false })}</span> paid of{" "}
                {formatMoney(plan.totalMinor, STIPEND_CURRENCY, { zeroLabel: false })}
              </p>
              {/* Paid solid, scheduled lighter, the rest is the track. Decorative: the figures say it in words. */}
              <div aria-hidden className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-ink-200">
                <span className="h-full bg-brand-700" style={{ width: pct(plan.paidMinor) }} />
                <span className="h-full bg-brand-300" style={{ width: pct(plan.pendingMinor) }} />
              </div>
            </>
          ) : (
            // Nothing paid yet: an empty bar says nothing, the amount to come does.
            <>
              <p className="nums text-base font-semibold text-ink-900">{formatMoney(plan.totalMinor, STIPEND_CURRENCY, { zeroLabel: false })}</p>
              <p className="text-xs text-ink-600">to come</p>
            </>
          )}
        </div>
      </div>
      <BonusRows bonus={bonus} />
      <details className="group mt-1">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
          {/* One run of text, so a phone wraps it as a sentence, not as two columns. */}
          <span>
            <span className="font-medium text-primary group-hover:underline">Month by month</span>
            <span className="nums text-ink-600">
              {" "}
              · {formatMoney(card.monthlyMinor ?? 0, STIPEND_CURRENCY, { zeroLabel: false })} a month{current ? ", running now" : ""}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-primary transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="mt-3 grid max-w-2xl gap-3">
          <MonthRail months={plan.months} monthlyMinor={card.monthlyMinor ?? 0} />
          <Link
            href={`/intern/timesheets?proposalId=${encodeURIComponent(card.proposalId)}`}
            className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Timesheets for this internship
          </Link>
        </div>
      </details>
    </li>
  );
}
