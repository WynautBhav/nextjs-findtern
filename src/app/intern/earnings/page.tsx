import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, ChevronDown } from "lucide-react";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, Section, StatList, type StatItem } from "@/components/app/stat";
import { bankOnFileOf, maskAccount } from "@/components/intern/bank-mask";
import { StipendTimeline } from "@/components/intern/stipend/stipend-timeline";
import { STIPEND_CURRENCY, orderEngagements, stipendPlan, totalsByCurrency, type StipendPlan } from "@/components/intern/stipend/months";
import { PaymentLedger } from "@/components/intern/stipend/payment-ledger";
import { buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { earningsEngagements, earningsView, type EngagementEarnings } from "@/lib/earnings-view";
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
const money = (n: number, currency: string = STIPEND_CURRENCY) => formatMoney(n, currency, { zeroLabel: false });

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
        <PageHead title="Stipend" />
        {offer ? (
          <EmptyScene
            title="Your stipend starts once the company pays"
            body={`You accepted the ${parseOffer(offer.offerDetails, offer.currency).roleTitle || "internship"} offer. Once the company completes the payment you are hired, and your stipend and its payment dates appear here.`}
            who="Waiting on the company"
            next={{ label: "See the offer", href: `/intern/proposals/${offer.id}` }}
          />
        ) : (
          <EmptyScene
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
  const bank = bankOnFileOf(extra);
  const failed = totalsByCurrency(data.payouts, "failed");
  const paidTotals = totalsByCurrency(data.payouts, "paid");
  const paidCount = data.payouts.filter((p) => payoutState(p.status) === "paid").length;
  const soleId = cards.length === 1 ? cards[0].proposalId : null;
  const plans = cards.map((card) =>
    card.eligible && card.monthlyMinor
      ? stipendPlan({ months: card.months, monthlyMinor: card.monthlyMinor, startDate: card.startDate, payouts: stipends.filter((p) => belongsTo(p, card.proposalId, soleId)) })
      : null,
  );
  const rows = orderEngagements(cards.map((card, i) => ({ card, plan: plans[i], startDate: card.startDate, months: card.months })));

  const planSum = (k: "pendingMinor" | "toComeMinor") => plans.reduce((n, p) => n + (p?.[k] ?? 0), 0);
  const inrPaid = paidTotals.find((t) => t.currency === STIPEND_CURRENCY)?.minor ?? 0;
  const scheduled = planSum("pendingMinor");
  const toCome = planSum("toComeMinor");
  const lastPaid = data.payouts
    .filter((p) => payoutState(p.status) === "paid")
    .map((p) => p.paidAt ?? p.createdAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const nextPayout = cards.map((c) => c.nextPayoutAt).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0];
  const running = rows.find((r) => r.plan?.months.some((m) => m.current));
  const monthly = running?.card.monthlyMinor ?? (rows.length === 1 ? rows[0].card.monthlyMinor : null);

  // Lead: what has reached you. Before the first payment, what is coming instead (a zero is not a figure).
  const lead =
    inrPaid > 0 ? (
      <LeadStat
        label="Paid to you"
        tone="brand"
        value={
          <>
            ₹<RollingNumber value={inrPaid / 100} />
          </>
        }
        note={
          paidTotals.filter((t) => t.currency !== STIPEND_CURRENCY).length
            ? `Rupees only. ${paidTotals.filter((t) => t.currency !== STIPEND_CURRENCY).map((t) => money(t.minor, t.currency)).join(" and ")} was paid in another currency and sits in the list below.`
            : `${paidCount === 1 ? "One transfer" : `${paidCount} transfers`} received${lastPaid ? `, the latest on ${formatDate(lastPaid)}` : ""}.`
        }
      />
    ) : (
      <LeadStat
        label="Not yet scheduled"
        value={
          <>
            ₹<RollingNumber value={(scheduled + toCome) / 100} />
          </>
        }
        note="Nothing has been paid yet. Each month is paid after it ends and its timesheet is approved."
      />
    );
  const rest: StatItem[] = [
    ...(inrPaid > 0 && scheduled > 0 ? [{ label: "Scheduled", value: money(scheduled), hint: nextPayout ? `Next on ${formatDate(nextPayout)}` : "Date to be set" }] : []),
    ...(inrPaid > 0 && toCome > 0 ? [{ label: "Not yet scheduled", value: money(toCome), hint: "The months after the last scheduled one" }] : []),
    ...(inrPaid === 0 && scheduled > 0 ? [{ label: "Scheduled", value: money(scheduled), hint: nextPayout ? `Next on ${formatDate(nextPayout)}` : "Date to be set" }] : []),
    ...(monthly ? [{ label: "Each month", value: money(monthly) }] : []),
  ];

  const bankNotice =
    paidCount > 0 && !bank.accountLast4
      ? {
          title: "Paid, but we have no bank account to match it to",
          body: `${paidTotals.map((t) => money(t.minor, t.currency)).join(" and ")} is marked paid, and no bank account is saved in your settings. Add the account it went to so the payment can be checked. If it has not reached you, write to Findtern with the reference below.`,
        }
      : !bank.accountLast4
        ? { title: "Add a bank account to be paid", body: "Your stipend goes to the account in your settings. Add it before the first month ends." }
        : null;

  return (
    <div>
      <PageHead
        title="Stipend"
        lede={
          bank.accountLast4 ? (
            <>
              Paid into your {bank.bankName || "bank"} account <span className="nums font-medium text-ink-700">{maskAccount(bank.accountLast4)}</span>.{" "}
              <Link href={BANK_HREF} className="font-medium text-brand-800 underline underline-offset-4">
                Change
              </Link>
            </>
          ) : null
        }
      />

      <div className="space-y-10">
        {failed.length > 0 ? (
          <Notice
            tone="danger"
            title={`${failed.map((f) => money(f.minor, f.currency)).join(" and ")} did not go through`}
            body="A transfer to your bank failed. It is not counted as paid or scheduled. Check your bank details; Findtern's team follows up on every failed transfer."
            action="Check your bank details"
          />
        ) : null}
        {bankNotice ? <Notice tone="signal" {...bankNotice} action="Add bank details" /> : null}

        <Overview lead={lead} rest={rest.length ? <StatList items={rest} /> : null} />

        {cards.length === 0 ? (
          <EmptyScene
            title="No paid internship right now"
            body="Payments from an earlier internship are listed below. A new stipend appears once a company hires you and completes the payment."
            next={{ label: "See your offers", href: "/intern/proposals" }}
          />
        ) : (
          <section data-first-content aria-label="Month by month" className="space-y-10">
            {rows.slice(0, SHOWN).map(({ card, plan }, i) => (
              <Engagement key={card.proposalId} card={card} plan={plan} open={i === 0} />
            ))}
            {rows.length > SHOWN ? (
              <details className="group">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-brand-800 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show all {rows.length} internships</span>
                  <span className="hidden group-open:inline">Show fewer</span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                </summary>
                <div className="mt-6 space-y-10">
                  {rows.slice(SHOWN).map(({ card, plan }) => (
                    <Engagement key={card.proposalId} card={card} plan={plan} open={false} />
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        )}

        {waitingOnPayment.length > 0 && cards.length > 0 ? (
          <p className="max-w-prose text-pretty text-sm text-ink-700">
            {waitingOnPayment.length === 1 ? "One accepted offer is" : `${waitingOnPayment.length} accepted offers are`} waiting on the company&apos;s payment. Its
            stipend appears here once they pay.
          </p>
        ) : null}

        <Section title="Every payment" hint="Newest first. Match the reference against your bank statement.">
          <PaymentLedger payouts={data.payouts} />
        </Section>
      </div>
    </div>
  );
}

/** A real notice with its action beside it. Signal for something owed to you, danger for a failed transfer. */
function Notice({ tone, title, body, action }: { tone: "signal" | "danger"; title: string; body: string; action: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-surface-raised p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 gap-3">
        <AlertCircle className={tone === "danger" ? "mt-0.5 size-5 shrink-0 text-danger" : "mt-0.5 size-5 shrink-0 text-signal"} aria-hidden />
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
          <p className="mt-1 max-w-xl text-pretty text-sm text-ink-700">{body}</p>
        </div>
      </div>
      <Link href={BANK_HREF} className={buttonClass({ variant: "primary", className: "shrink-0" })}>
        {action}
      </Link>
    </div>
  );
}

/** Same rule as earningsEngagements: `raw.proposalId`, or the only hire when a payout names none. */
function belongsTo(p: PayoutRow, proposalId: string, soleId: string | null): boolean {
  const raw = p.raw && typeof p.raw === "object" ? (p.raw as { proposalId?: unknown; proposal_id?: unknown }) : null;
  const pid = String(raw?.proposalId ?? raw?.proposal_id ?? "").trim();
  return pid ? pid === proposalId : proposalId === soleId;
}

function Engagement({ card, plan, open }: { card: EngagementEarnings; plan: StipendPlan | null; open: boolean }) {
  const title = `${card.roleTitle} at ${card.company}`;
  const hint = `${card.months} month${card.months === 1 ? "" : "s"}${card.joiningDate ? ` from ${formatDate(card.joiningDate).replace(/ /g, "\u00a0")}` : ""}`;
  const offerLink = (
    <Link href={`/intern/proposals/${encodeURIComponent(card.proposalId)}`} className="font-medium text-brand-800 underline-offset-4 hover:underline">
      See the offer
    </Link>
  );

  if (!plan) {
    return (
      <Section title={title} hint={hint} action={offerLink}>
        <p className="max-w-prose text-pretty text-sm text-ink-700">
          {!card.eligible
            ? "Candidates with a Findtern Score below 6 are not paid a stipend. A higher score makes later internships paid."
            : "The monthly stipend is not set on this offer, so there is nothing to track here yet."}
        </p>
      </Section>
    );
  }

  const timeline = <StipendTimeline months={plan.months} monthlyMinor={card.monthlyMinor ?? 0} />;
  const link = "font-medium text-brand-800 underline-offset-4 hover:underline";
  return (
    <section>
      <div className="mb-4 border-b border-ink-200 pb-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
        <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
          <p className="nums text-ink-600">{hint ?? "\u00a0"}</p>
          <p className="flex gap-5">
            {offerLink}
            <Link href={`/intern/timesheets?proposalId=${encodeURIComponent(card.proposalId)}`} className={link}>
              Timesheets
            </Link>
          </p>
        </div>
      </div>
      {open ? (
        timeline
      ) : (
        <details className="group">
          <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
            <span className="font-medium text-brand-800 group-hover:underline">Month by month</span>
            <span className="nums text-ink-600">· {money(plan.paidMinor)} paid of {money(plan.totalMinor)}</span>
            <ChevronDown className="size-4 shrink-0 text-brand-800 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <div className="mt-3">{timeline}</div>
        </details>
      )}
    </section>
  );
}
