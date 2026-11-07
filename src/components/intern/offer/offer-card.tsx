import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { OfferCountdown } from "@/components/app/offer-countdown";
import { OfferDecision } from "@/components/app/offer-decision";
import { proposalStatus } from "@/components/app/status";
import { Lift } from "@/components/intern/kit/motion";
import { modeLabel, type OfferFacts } from "@/components/intern/offer/offer-facts";
import { OfferSteps } from "@/components/intern/offer/offer-steps";
import { formatJoiningDate } from "@/lib/format";
import { canDecide } from "@/lib/intern-offer-view";
import type { ProposalRow } from "@/lib/journey";
import { FREE_DECLINES } from "@/lib/offer";
import { cn } from "@/lib/utils";

export type OfferCardRow = { p: ProposalRow; facts: OfferFacts; project: string | null };
export type OfferCardDecision = { declinesUsed: number; guaranteeEnded: boolean };

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

/**
 * One offer: the money first, large, then who and what, the terms in one quiet
 * line and a track showing how far the offer has come. An open offer carries
 * its decision on the right (same OfferDecision as the offer page).
 */
export function OfferCard({ p, facts, project, decision }: OfferCardRow & { decision: OfferCardDecision }) {
  const status = proposalStatus(facts.key);
  const open = canDecide(facts.key);
  const href = `/intern/proposals/${p.id}`;
  const terms = [facts.fullTime ? facts.location : facts.duration, modeLabel(facts.mode), `starts ${formatJoiningDate(facts.joiningDate)}`].filter(Boolean);

  return (
    <Lift>
      <article
        className={cn(
          "grid gap-5 rounded-apple-xl border bg-white p-5 shadow-[0_1px_2px_rgba(4,29,23,0.05),0_12px_28px_-18px_rgba(4,29,23,0.2)] sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8 lg:p-6",
          open ? "border-brand-600/40" : "border-ink-200/70",
        )}
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cn(
                "nums text-ink-900",
                facts.amountIsText ? "text-xl font-medium tracking-[-0.02em]" : "text-[clamp(2rem,4.5vw,2.75rem)] font-light leading-none tracking-[-0.04em]",
              )}
            >
              {facts.amount}
            </span>
            {facts.per ? <span className="text-sm text-text-subtle">{facts.per}</span> : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h3 className="text-pretty text-base font-semibold text-ink-900">
              <Link href={href} className={cn("rounded-apple-sm hover:text-brand-700", FOCUS)}>
                {facts.role}
              </Link>
            </h3>
            <Pill tone={status.tone}>{status.label}</Pill>
            {facts.edited ? <Pill tone="new">Updated</Pill> : null}
          </div>
          <p className="mt-1 text-sm text-ink-600">
            {facts.company ?? "Company shared after hire"}
            {project ? <span className="text-text-subtle"> · {project}</span> : null}
          </p>
          <p className="nums mt-1 text-sm text-ink-600">{terms.join(" · ")}</p>
          <OfferSteps stateKey={facts.key} fullTime={facts.fullTime} className="mt-4 max-w-md" />
          {open ? (
            <div className="mt-3"><OfferCountdown startDate={facts.startDate} /></div>
          ) : (
            <p className="mt-3 text-pretty text-sm text-text-subtle">{status.detail}</p>
          )}
        </div>
        {open ? (
          <div className="space-y-2 sm:w-72 sm:self-center">
            <OfferDecision
              layout="row"
              proposalId={p.id}
              roleTitle={facts.role}
              company={facts.company ?? "The company"}
              startDate={facts.startDate}
              joiningDate={facts.joiningDate}
              fullTime={facts.fullTime}
              declinesUsed={decision.declinesUsed}
              freeDeclines={FREE_DECLINES}
              guaranteeEnded={decision.guaranteeEnded}
            />
            <Link href={href} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-brand-700 hover:text-brand-800", FOCUS)}>
              Read the full offer
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <Link href={href} className={cn("inline-flex min-h-11 items-center justify-center gap-1.5 self-center rounded-apple-sm px-4 text-sm font-medium text-brand-700 hover:text-brand-800", FOCUS)}>
            View offer
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </article>
    </Lift>
  );
}
