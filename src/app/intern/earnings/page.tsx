import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Landmark } from "lucide-react";

import { EmptyScene, PageHead, Surface } from "@/components/app/primitives";
import { Tile } from "@/components/app/tiles";
import { MonthRail } from "@/components/intern/stipend/month-rail";
import { STIPEND_CURRENCY, stipendPlan, totalsByCurrency } from "@/components/intern/stipend/months";
import { PaymentLedger } from "@/components/intern/stipend/payment-ledger";
import { StipendGauge } from "@/components/intern/stipend/stipend-gauge";
import { buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { earningsEngagements, earningsView, type EngagementEarnings } from "@/lib/earnings-view";
import { formatJoiningDate, formatMoney } from "@/lib/format";
import { isHiredProposal } from "@/lib/hire-status";
import { loadInternData } from "@/lib/intern-data";
import { isAcceptedStatus, type PayoutRow } from "@/lib/journey";
import { parseOffer } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Stipend",
  robots: { index: false, follow: false },
};

const BANK_HREF = "/intern/settings#bank";

/**
 * Stipend (legacy earnings.tsx).
 *
 * Per HIRED internship (INW-11 / INT-08): a gauge of paid against the whole
 * stipend beside the months on a rail, each paid month with its date and bank
 * reference. Below, every payout as a ledger. Paid, scheduled and failed stay
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
  const cards = earningsEngagements(data.proposals, data.payouts, data.names, score);
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
  const soleId = cards.length === 1 ? cards[0].proposalId : null;

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
            "Add your bank account in settings so Findtern can pay your stipend."
          )
        }
        action={
          <Link href={BANK_HREF} className={buttonClass({ variant: "outline" })}>
            <Landmark className="size-4" aria-hidden />
            {last4 ? "Bank details" : "Add bank details"}
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
          cards.map((card) => (
            <Engagement key={card.proposalId} card={card} payouts={data.payouts.filter((p) => belongsTo(p, card.proposalId, soleId))} />
          ))
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
                "Once a month is approved, Findtern schedules the payment. Its date shows here as soon as it is set.",
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
          <Tile title="Every payment" description="Newest first, in the currency it was paid in.">
            <PaymentLedger payouts={data.payouts} />
          </Tile>
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

function Engagement({ card, payouts }: { card: EngagementEarnings; payouts: PayoutRow[] }) {
  const description = `${card.company} · ${card.months} month${card.months === 1 ? "" : "s"}${card.startDate ? ` from ${formatJoiningDate(card.startDate)}` : ""}`;
  const offer = { href: `/intern/proposals/${encodeURIComponent(card.proposalId)}`, label: "The offer" };

  if (!card.eligible || !card.monthlyMinor) {
    return (
      <Tile title={card.roleTitle} description={description} action={offer}>
        <p className="text-pretty text-sm text-text-subtle">
          {!card.eligible
            ? "Candidates with a Findtern Score below 6 are not paid a stipend. A higher score makes later internships paid."
            : "The monthly stipend is not set on this offer, so there is nothing to track here yet."}
        </p>
      </Tile>
    );
  }

  const plan = stipendPlan({ months: card.months, monthlyMinor: card.monthlyMinor, startDate: card.startDate, payouts });
  return (
    <section aria-label={card.roleTitle} className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Tile title={card.roleTitle} description={description} action={offer}>
        <StipendGauge plan={plan} id={card.proposalId} />
      </Tile>
      <Tile
        title="Month by month"
        description={`${formatMoney(card.monthlyMinor, STIPEND_CURRENCY)} a month, as agreed in your offer.`}
        action={{ href: `/intern/timesheets?proposalId=${encodeURIComponent(card.proposalId)}`, label: "Timesheets" }}
      >
        <MonthRail months={plan.months} monthlyMinor={card.monthlyMinor} />
      </Tile>
    </section>
  );
}
