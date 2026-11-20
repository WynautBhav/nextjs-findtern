import type { Metadata } from "next";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { bonusTotals, completionBonusesByHire, totalWithBonusLine } from "@/components/intern/stipend/bonus";
import { EarningsView } from "@/components/intern/stipend/earnings-view";
import { orderEngagements, stipendPlan, stipendTotalsLine, totalsByCurrency } from "@/components/intern/stipend/months";
import { requireRole } from "@/lib/auth";
import { bankPrompt, earningsEngagements, earningsView } from "@/lib/earnings-view";
import { isHiredProposal } from "@/lib/hire-status";
import { loadInternData } from "@/lib/intern-data";
import { isAcceptedStatus, payoutState, type PayoutRow } from "@/lib/journey";
import { parseOffer } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Stipend",
  robots: { index: false, follow: false },
};

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

  // Completion bonuses belong to a hire by bonus_proposal_id; all of them come from this intern's own payouts (loadInternData filters by session uid).
  const bonuses = completionBonusesByHire(data.payouts);
  const withBonus = totalWithBonusLine(
    { paidMinor: plans.reduce((n, p) => n + (p?.paidMinor ?? 0), 0), pendingMinor: plans.reduce((n, p) => n + (p?.pendingMinor ?? 0), 0) },
    bonusTotals(data.payouts),
  );

  const rows = orderEngagements(cards.map((card, i) => ({ card, plan: plans[i], startDate: card.startDate, months: card.months })));

  return (
    <EarningsView
      lede={
        last4 ? (
          <>
            Paid into your {bankName || "bank"} account ending <span className="nums font-medium text-ink-700">{last4}</span>.
          </>
        ) : (
          prompt.text
        )
      }
      bankButton={prompt.button}
      failed={failed}
      rows={rows}
      bonuses={bonuses}
      totalsLine={stipendTotalsLine(plans)}
      withBonus={withBonus}
      waitingOnPayment={waitingOnPayment.length}
      payouts={data.payouts}
    />
  );
}

/** Same rule as earningsEngagements: `raw.proposalId`, or the only hire when a payout names none. */
function belongsTo(p: PayoutRow, proposalId: string, soleId: string | null): boolean {
  const raw = p.raw && typeof p.raw === "object" ? (p.raw as { proposalId?: unknown; proposal_id?: unknown }) : null;
  const pid = String(raw?.proposalId ?? raw?.proposal_id ?? "").trim();
  return pid ? pid === proposalId : proposalId === soleId;
}
