import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, ArrowDownRight, Clock3, Landmark, XCircle } from "lucide-react";

import { EmptyScene, HeroBand, PageHead, Pill, SectionHead, StatTile, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { earningsEngagements, earningsView, type EngagementEarnings } from "@/lib/earnings-view";
import { formatDayLabel, formatJoiningDate, formatMoney } from "@/lib/format";
import { isHiredProposal } from "@/lib/hire-status";
import { loadInternData } from "@/lib/intern-data";
import { isAcceptedStatus, payoutState, readScheduledForDate } from "@/lib/journey";
import { parseOffer } from "@/lib/offer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Stipend",
  robots: { index: false, follow: false },
};

const BANK_HREF = "/intern/settings#bank";

/**
 * Stipend (legacy earnings.tsx).
 *
 * The hero keeps paid and pending apart (INT-01 / INW-04): only a pending
 * payout is on its way, and a failed one is called out on its own with a
 * pointer to the bank details. Below it, one card per HIRED internship
 * (INW-11 / INT-08): role, company, length, monthly stipend, paid, pending,
 * next payout and what is still to come, with View proposal and View
 * timesheet. An offer that is accepted but not yet paid for by the company
 * earns nothing yet and is not counted.
 *
 * "Expected" is never "due": a scheduled date can move, so the copy talks
 * about what is scheduled, not what someone is owed by when.
 */
export default async function InternEarnings() {
  const session = await requireRole("intern");
  const data = await loadInternData(session.uid);
  const { money } = data;

  const score = Number(((data.onboarding?.extraData ?? {}) as Record<string, unknown>).findternScore ?? 0) || 0;
  const cards = earningsEngagements(data.proposals, data.payouts, data.names, score);
  const waitingOnPayment = data.proposals.filter(
    (p) => isAcceptedStatus(p.status) && !isHiredProposal(p) && !parseOffer(p.offerDetails, p.currency).fullTime,
  );
  const cur = money.currency;

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

  return (
    <div>
      <HeroBand
        title="Your stipend"
        lede="Findtern pays it to your bank account once each month's timesheet is approved."
        actions={
          <Link href={BANK_HREF} className={buttonClass({ variant: "outlineLight" })}>
            <Landmark className="size-4" aria-hidden />
            Check your bank details
          </Link>
        }
      >
        {/* Paid and pending; the monthly figure is on the engagement card below. */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            tone="onDark"
            label="Paid to you"
            value={money.paidMinor > 0 ? formatMoney(money.paidMinor, cur, { zeroLabel: false }) : null}
            empty="Nothing paid yet"
            hint={money.lastPaidAt ? `Last landed ${whenLabel(money.lastPaidAt)}` : undefined}
          />
          <StatTile
            tone="onDark"
            label="Pending payout"
            value={money.incomingMinor > 0 ? formatMoney(money.incomingMinor, cur, { zeroLabel: false }) : null}
            empty="Nothing scheduled"
            hint={money.nextExpectedAt ? `Next ${onDate(money.nextExpectedAt)}` : undefined}
          />
        </div>
      </HeroBand>

      {money.failedMinor > 0 ? (
        <Surface role="alert" className="mb-8 flex flex-col gap-4 border-danger/25 bg-danger-soft/50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <div>
              <p className="text-[0.9375rem] font-semibold text-ink-900">
                <span className="nums">{formatMoney(money.failedMinor, cur, { zeroLabel: false })}</span> did not go through
              </p>
              <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-700">
                A transfer to your bank failed. It is not counted as paid or pending. Check your bank details; Findtern&apos;s team follows up on every failed transfer.
              </p>
            </div>
          </div>
          <Link href={BANK_HREF} className={buttonClass({ variant: "outline", size: "md", className: "shrink-0" })}>
            Check your bank details
          </Link>
        </Surface>
      ) : null}

      <div className="grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          {/* ── One card per hired internship ─────────────────────── */}
          <section>
            <SectionHead
              title="Your internships"
              hint={cards.length > 0 ? "One card for each internship the company has paid for." : undefined}
            />
            {cards.length === 0 ? (
              <EmptyScene
                title="No paid internship right now"
                body="Payments from an earlier internship are listed below. A new stipend appears here once a company hires you and completes the payment."
                next={{ label: "See your offers", href: "/intern/proposals" }}
              />
            ) : (
              <ul className="space-y-4">
                {cards.map((card) => (
                  <EngagementCard key={card.proposalId} card={card} />
                ))}
              </ul>
            )}
            {waitingOnPayment.length > 0 && cards.length > 0 ? (
              <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-600">
                {waitingOnPayment.length === 1 ? "One accepted offer is" : `${waitingOnPayment.length} accepted offers are`} waiting on the
                company&apos;s payment. Its stipend appears here once they pay.
              </p>
            ) : null}
          </section>

          {/* ── Every payment ─────────────────────────────────────── */}
          <section>
            <SectionHead title="Every payment" hint="Newest first, with the bank reference." />
            {data.payouts.length === 0 ? (
              <EmptyScene
                title="No payment recorded yet"
                body="Your first payment is scheduled after your first month is approved. It appears here with its date, and you are notified when it lands."
                who="Findtern pays it"
              />
            ) : (
              <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
                {data.payouts.map((payout) => {
                  const state = payoutState(payout.status);
                  const scheduled = readScheduledForDate(payout);
                  const Icon = state === "paid" ? ArrowDownRight : state === "failed" ? XCircle : Clock3;
                  return (
                    <li key={payout.id} className="flex items-center gap-4 px-4 py-4 sm:px-5">
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-10 shrink-0 place-items-center rounded-full",
                          state === "paid" ? "bg-success-soft text-success" : state === "failed" ? "bg-danger-soft text-danger" : "bg-accent-100 text-accent-700",
                        )}
                      >
                        <Icon className="size-4" strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="nums text-[0.9375rem] font-semibold text-ink-900">
                          {formatMoney(payout.amountMinor ?? 0, payout.currency ?? "INR", { zeroLabel: false })}
                        </p>
                        <p className="mt-0.5 break-words text-sm text-ink-600">
                          {state === "paid"
                            ? [payout.paidAt ? `Landed ${whenLabel(payout.paidAt)}` : "Paid", payout.referenceId ? `Ref ${payout.referenceId}` : null].filter(Boolean).join(" · ")
                            : state === "failed"
                              ? payout.notes || "The transfer did not go through"
                              : scheduled
                                ? `Scheduled ${onDate(scheduled)}`
                                : "Date to be set"}
                        </p>
                      </div>
                      <Pill tone={state === "paid" ? "paid" : state === "failed" ? "closed" : "waiting"}>
                        {state === "paid" ? "Paid" : state === "failed" ? "Failed" : state === "pending" ? "Pending" : "Recorded"}
                      </Pill>
                    </li>
                  );
                })}
              </Surface>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {/* The explainer is for before the first payment. */}
          {money.paidMinor === 0 && money.incomingMinor === 0 ? (
          <Surface className="p-5">
            <SectionHead title="How payment works" />
            <ol className="space-y-3">
              {[
                "You mark your days on Timesheets and send each month to your manager.",
                "Once a month is approved, Findtern schedules the payment. Its date shows here as soon as it is set.",
                "Each payment carries a bank reference so you can match it against your statement.",
                "It goes to the bank account in your settings, so keep those details right.",
              ].map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span className="nums mt-px grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">
                    {i + 1}
                  </span>
                  <span className="text-pretty text-sm leading-relaxed text-ink-700">{line}</span>
                </li>
              ))}
            </ol>
          </Surface>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function EngagementCard({ card }: { card: EngagementEarnings }) {
  return (
    <li>
      <Surface className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-ink-900">{card.roleTitle}</h3>
            <p className="mt-0.5 text-sm text-ink-600">
              {card.company} · {card.months} month{card.months === 1 ? "" : "s"}
              {card.startDate ? ` from ${formatJoiningDate(card.startDate)}` : ""}
            </p>
          </div>
          <Pill tone={card.eligible ? "paid" : "closed"}>{card.eligible ? "Hired" : "No stipend"}</Pill>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-ink-100 pt-5 md:grid-cols-4">
          <Figure
            label="Monthly stipend"
            value={!card.eligible ? null : card.monthlyMinor ? formatMoney(card.monthlyMinor, "INR") : null}
            empty={!card.eligible ? "Not eligible" : "Not set"}
          />
          <Figure label="Paid" value={card.paidMinor > 0 ? formatMoney(card.paidMinor, "INR", { zeroLabel: false }) : null} empty="Nothing yet" />
          <Figure
            label="Pending payout"
            value={card.pendingMinor > 0 ? formatMoney(card.pendingMinor, "INR", { zeroLabel: false }) : null}
            empty="None scheduled"
            hint={card.nextPayoutAt ? `Next payout ${onDate(card.nextPayoutAt)}` : undefined}
          />
          <Figure
            label="Still to come"
            value={card.remainingMinor > 0 ? formatMoney(card.remainingMinor, "INR") : null}
            empty={card.eligible && card.monthlyMinor ? "All scheduled" : "None"}
          />
        </dl>

        {!card.eligible ? (
          <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-600">
            Candidates with a Findtern Score below 6 are not paid a stipend. A higher score makes later internships paid.
          </p>
        ) : null}
        {card.failedMinor > 0 ? (
          <p className="mt-4 text-sm text-danger">
            <span className="nums font-semibold">{formatMoney(card.failedMinor, "INR", { zeroLabel: false })}</span> for this internship did not go through.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link href={`/intern/timesheets?proposalId=${encodeURIComponent(card.proposalId)}`} className={buttonClass({ variant: "primary", size: "md" })}>
            View timesheets
          </Link>
          <Link href={`/intern/proposals/${encodeURIComponent(card.proposalId)}`} className={buttonClass({ variant: "outline", size: "md" })}>
            View proposal
          </Link>
        </div>
      </Surface>
    </li>
  );
}

function Figure({ label, value, empty, hint }: { label: string; value: string | null; empty: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className="mt-1">
        {value ? (
          <span className="nums block text-lg font-semibold tracking-[-0.01em] text-ink-900">{value}</span>
        ) : (
          <span className="block text-[0.9375rem] font-medium text-ink-600">{empty}</span>
        )}
        {hint ? <span className="mt-0.5 block text-xs text-ink-600">{hint}</span> : null}
      </dd>
    </div>
  );
}

/** "in 5 days" / "today" / "on 1 Nov 2026", to follow a verb ("Scheduled …"). */
function onDate(value: Date | string | null): string {
  const label = whenLabel(value);
  return /^\d/.test(label) && !/ago$/.test(label) ? `on ${label}` : label;
}

/** "today" / "3 days ago" mid-sentence; an absolute date keeps its capital. */
function whenLabel(value: Date | string | null): string {
  const label = formatDayLabel(value);
  return /^(Today|Yesterday|Tomorrow|In \d+ days|\d+ days ago)$/.test(label) ? label.toLowerCase() : label;
}
