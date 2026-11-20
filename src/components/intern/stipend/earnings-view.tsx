import Link from "next/link";
import { AlertCircle, ChevronDown, Landmark } from "lucide-react";

import { EmptyScene, PageHead, Surface } from "@/components/app/primitives";
import { NumberedSteps } from "@/components/app/numbered-steps";
import { Tile } from "@/components/app/tiles";
import { buttonClass } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { EngagementEarnings } from "@/lib/earnings-view";
import type { PayoutRow } from "@/lib/journey";

import type { HireBonus } from "./bonus";
import { Engagement } from "./engagement-row";
import type { StipendPlan } from "./months";
import { PaymentLedger } from "./payment-ledger";

export const BANK_HREF = "/intern/settings#bank";
/** Internships shown before "Show all N": the running and next ones, not sixteen identical rows. */
const SHOWN = 6;

/**
 * The Stipend page, props only: the page loads the data and works out the numbers, this lays them out.
 * Intern-only: it shows what the intern is paid and is never rendered for an employer or a college.
 */
export function EarningsView({
  lede,
  bankButton,
  failed,
  rows,
  bonuses,
  totalsLine,
  withBonus,
  waitingOnPayment,
  payouts,
}: {
  lede: React.ReactNode;
  bankButton: string;
  failed: { currency: string; minor: number }[];
  rows: { card: EngagementEarnings; plan: StipendPlan | null }[];
  bonuses: Map<string, HireBonus>;
  totalsLine: string;
  withBonus: string | null;
  waitingOnPayment: number;
  payouts: PayoutRow[];
}) {
  return (
    <div>
      <PageHead
        title="Your stipend"
        lede={lede}
        action={
          <Link href={BANK_HREF} className={buttonClass({ variant: "outline" })}>
            <Landmark className="size-4" aria-hidden />
            {bankButton}
          </Link>
        }
      />

      <div className="space-y-6 lg:space-y-8">
        {failed.length > 0 ? (
          <Surface role="alert" className="flex flex-col gap-4 border-danger/25 bg-danger-soft/50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <AlertCircle className="mt-1 size-5 shrink-0 text-danger" aria-hidden />
              <div>
                <p className="text-base font-medium text-ink-900">
                  <span className="nums">{failed.map((f) => formatMoney(f.minor, f.currency, { zeroLabel: false })).join(" and ")}</span> did not go
                  through
                </p>
                <p className="mt-1 text-pretty text-sm text-ink-700">
                  A transfer to your bank failed. It is not counted as paid or scheduled. Check your bank details; Findtern&apos;s team follows up on
                  every failed transfer.
                </p>
              </div>
            </div>
            <Link href={BANK_HREF} className={buttonClass({ variant: "outline", size: "md", className: "shrink-0" })}>
              Check your bank details
            </Link>
          </Surface>
        ) : null}

        {rows.length === 0 ? (
          <Tile title="Your internships">
            <EmptyScene
              title="No paid internship right now"
              body="Payments from an earlier internship are listed here. A new stipend appears once a company hires you and completes the payment."
              next={{ label: "See your offers", href: "/intern/proposals" }}
              className="border-0 bg-transparent px-0 py-6"
            />
          </Tile>
        ) : (
          <div data-first-content>
            <Tile
              title={rows.length === 1 ? "Your internship" : `Your internships (${rows.length})`}
              description={totalsLine}
            >
              {withBonus ? <p className="nums -mt-1 mb-1 text-sm font-medium text-ink-900">{withBonus}</p> : null}
              {/* One row per internship, thin dividers inside the card. */}
              <ul className="divide-y divide-ink-200/70 border-t border-ink-200/70">
                {rows.slice(0, SHOWN).map(({ card, plan }) => (
                  <Engagement key={card.proposalId} card={card} plan={plan} bonus={bonuses.get(card.proposalId)} />
                ))}
              </ul>
              {rows.length > SHOWN ? (
                <details className="group">
                  <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show all {rows.length}</span>
                    <span className="hidden group-open:inline">Show fewer</span>
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                  </summary>
                  <ul className="divide-y divide-ink-200/70 border-t border-ink-200/70">
                    {rows.slice(SHOWN).map(({ card, plan }) => (
                      <Engagement key={card.proposalId} card={card} plan={plan} bonus={bonuses.get(card.proposalId)} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </Tile>
          </div>
        )}

        {waitingOnPayment > 0 && rows.length > 0 ? (
          <p className="text-pretty text-sm text-text-subtle">
            {waitingOnPayment === 1 ? "One accepted offer is" : `${waitingOnPayment} accepted offers are`} waiting on the
            company&apos;s payment. Its stipend appears here once they pay.
          </p>
        ) : null}

        {payouts.length === 0 ? (
          <Tile title="How payment works">
            <NumberedSteps
              steps={[
                "You mark your days on Timesheets and send each month to your manager.",
                "Each month's stipend (score 6 and above) is paid after that month ends. Once the month is approved, Findtern schedules the payment. Its date shows here as soon as it is set.",
                "Each payment carries a bank reference so you can match it against your statement.",
                "It goes to the bank account in your settings, so keep those details right.",
              ]}
            />
          </Tile>
        ) : (
          <Tile title="Every payment" description="Newest first, in the currency it was paid in.">
            <PaymentLedger payouts={payouts} />
          </Tile>
        )}
      </div>
    </div>
  );
}
