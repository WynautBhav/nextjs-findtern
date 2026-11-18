import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, ChevronDown, Landmark } from "lucide-react";

import { EmptyScene, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { Tile } from "@/components/app/tiles";
import { MonthRail } from "@/components/intern/stipend/month-rail";
import { STIPEND_CURRENCY, orderEngagements, stipendPlan, stipendTotalsLine, totalsByCurrency, type StipendPlan } from "@/components/intern/stipend/months";
import { PaymentLedger } from "@/components/intern/stipend/payment-ledger";
import { buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { bankPrompt, earningsEngagements, earningsView, type EngagementEarnings } from "@/lib/earnings-view";
import { formatDate, formatMoney } from "@/lib/format";
import { isHiredProposal } from "@/lib/hire-status";
import { loadInternData } from "@/lib/intern-data";
import { isAcceptedStatus, payoutState, type PayoutRow } from "@/lib/journey";
import { parseOffer } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Stipend",
  robots: { index: false, follow: false },
};

const BANK_HREF = "/intern/settings#bank";
/** Internships shown before "Show all N": the running and next ones, not sixteen identical rows. */
const SHOWN = 6;

/**
 * Stipend (legacy earnings.tsx).
 *
 * One row per HIRED internship (INW-11 / INT-08): paid against the whole
 * stipend, with the months on a rail behind "Month by month", each paid month
 * with its date and bank reference. Below, every payout as a ledger. Paid, scheduled and failed stay
 * apart (INT-01 / INW-04), and amounts in different currencies are never
 * added. An offer accepted but not yet paid for by the company earns nothing
 * yet and is not counted.
 */
export default async function InternEarnings() {
  const session = await requireRole("intern");
  // One read: loadInternData already runs its queries in parallel.
  const data = await loadInternData(session.uid);

  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = Number(extra.findternScore ?? 0) || 0;
  // A completion bonus is not a stipend month: engagement cards and month plans see stipends only.
  const stipends = data.payouts.filter((p) => p.kind !== "completion_bonus");
  const cards = earningsEngagements(data.proposals, stipends, data.names, score);
  const waitingOnPayment = data.proposals.filter(
    (p) => isAcceptedStatus(p.status) && !isHiredProposal(p) && !parseOffer(p.offerDetails, p.currency).fullTime,
  );

  if (earningsView(data.payouts.length, cards.length > 0) === "empty") {
    const offer = waitingOnPayment[0];
    return (
      <div>
        <PageHead title="Your stipend" lede="What has been paid to you, what is scheduled, and for which internship." />
        {offer ? (
          <EmptyScene
            art
            title="Your stipend starts once the company pays"
            body={`You accepted the ${parseOffer(offer.offerDetails, offer.currency).roleTitle || "internship"} offer. Once the company completes the payment you are hired, and your stipend and its payment dates appear here.`}
            who="Waiting on the company"
            next={{ label: "See the offer", href: `/intern/proposals/${offer.id}` }}
          />
        ) : (
          <EmptyScene
            art
            title="No stipend yet"
            body="Your stipend starts when a company hires you. It is agreed in the offer, at a rate you see before you accept, and Findtern pays it to the bank account in your settings."
            who="Payment dates are set by the company, not by us"
            next={{ label: "See your offers", href: "/intern/proposals" }}
          />
        )}
      </div>
    );
  }

  // Only the bank's name and the last 4 digits reach the page; the full number stays on the server.
  const bank = (extra.bankDetails ?? extra.bank ?? {}) as { bankName?: unknown; accountNumber?: unknown };
  const last4 = String(bank.accountNumber ?? "").replace(/\D/g, "").slice(-4);
  const bankName = typeof bank.bankName === "string" ? bank.bankName.trim() : "";
  const failed = totalsByCurrency(data.payouts, "failed");
  const prompt = bankPrompt({ last4, paidCount: data.payouts.filter((p) => payoutState(p.status) === "paid").length });
  const soleId = cards.length === 1 ? cards[0].proposalId : null;
  const plans = cards.map((card) =>
    card.eligible && card.monthlyMinor
      ? stipendPlan({ months: card.months, monthlyMinor: card.monthlyMinor, startDate: card.startDate, payouts: stipends.filter((p) => belongsTo(p, card.proposalId, soleId)) })
      : null,
  );

  const rows = orderEngagements(cards.map((card, i) => ({ card, plan: plans[i], startDate: card.startDate, months: card.months })));

  return (
    <div>
      <PageHead
        title="Your stipend"
        lede={
          last4 ? (
            <>
              Paid into your {bankName || "bank"} account ending <span className="nums font-medium text-ink-700">{last4}</span>.
            </>
          ) : (
            prompt.text
          )
        }
        action={
          <Link href={BANK_HREF} className={buttonClass({ variant: "outline" })}>
            <Landmark className="size-4" aria-hidden />
            {prompt.button}
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

        {cards.length === 0 ? (
          <Tile title="Your internships">
            <EmptyScene
              title="No paid internship right now"
              body="Payments from an earlier internship are listed here. A new stipend appears once a company hires you and completes the payment."
              next={{ label: "See your offers", href: "/intern/proposals" }}
              className="border-0 bg-transparent px-0 py-6"
            />
          </Tile>
        ) : (
          <section data-first-content aria-label="Your internships">
            <SectionHead
              title={cards.length === 1 ? "Your internship" : `Your internships (${cards.length})`}
              hint={stipendTotalsLine(plans)}
              className="mb-0 border-b border-ink-200/70 pb-3"
            />
            {/* Thin dividers, one row per internship: the employer candidate list's language. */}
            <ul className="divide-y divide-ink-200/70 border-b border-ink-200/70">
              {rows.slice(0, SHOWN).map(({ card, plan }) => (
                <Engagement key={card.proposalId} card={card} plan={plan} />
              ))}
            </ul>
            {rows.length > SHOWN ? (
              <details className="group">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show all {rows.length}</span>
                  <span className="hidden group-open:inline">Show fewer</span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                </summary>
                <ul className="divide-y divide-ink-200/70 border-t border-ink-200/70">
                  {rows.slice(SHOWN).map(({ card, plan }) => (
                    <Engagement key={card.proposalId} card={card} plan={plan} />
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        )}

        {waitingOnPayment.length > 0 && cards.length > 0 ? (
          <p className="text-pretty px-1 text-sm text-text-subtle">
            {waitingOnPayment.length === 1 ? "One accepted offer is" : `${waitingOnPayment.length} accepted offers are`} waiting on the
            company&apos;s payment. Its stipend appears here once they pay.
          </p>
        ) : null}

        {data.payouts.length === 0 ? (
          <Tile title="How payment works">
            <ol className="space-y-3">
              {[
                "You mark your days on Timesheets and send each month to your manager.",
                "Each month's stipend (score 6 and above) is paid after that month ends. Once the month is approved, Findtern schedules the payment. Its date shows here as soon as it is set.",
                "Each payment carries a bank reference so you can match it against your statement.",
                "It goes to the bank account in your settings, so keep those details right.",
              ].map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span className="nums grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">{i + 1}</span>
                  <span className="text-pretty text-sm text-ink-700">{line}</span>
                </li>
              ))}
            </ol>
          </Tile>
        ) : (
          <section aria-labelledby="ledger-head">
            <h2 id="ledger-head" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
              Every payment
            </h2>
            <p className="mt-1 text-sm text-text-subtle">Newest first, in the currency it was paid in.</p>
            <div className="mt-3 border-t border-ink-200/70">
              <PaymentLedger payouts={data.payouts} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Same rule as earningsEngagements: `raw.proposalId`, or the only hire when a payout names none. */
function belongsTo(p: PayoutRow, proposalId: string, soleId: string | null): boolean {
  const raw = p.raw && typeof p.raw === "object" ? (p.raw as { proposalId?: unknown; proposal_id?: unknown }) : null;
  const pid = String(raw?.proposalId ?? raw?.proposal_id ?? "").trim();
  return pid ? pid === proposalId : proposalId === soleId;
}

function Engagement({ card, plan }: { card: EngagementEarnings; plan: StipendPlan | null }) {
  const description = `${card.company} · ${card.months} month${card.months === 1 ? "" : "s"}${card.joiningDate ? ` from ${formatDate(card.joiningDate)}` : ""}`;
  const title = (
    <div className="min-w-0">
      <Link
        href={`/intern/proposals/${encodeURIComponent(card.proposalId)}`}
        className="inline-flex min-h-11 items-center text-[15px] font-semibold text-ink-900 underline-offset-4 hover:text-brand-800 hover:underline sm:min-h-0"
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
