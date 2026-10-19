import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, Clock3, Info } from "lucide-react";

import { EmptyScene, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { requireRole } from "@/lib/auth";
import { loadInternData } from "@/lib/intern-data";
import { formatDayLabel, formatMoney } from "@/lib/format";
import { parseOffer, internStipendInrMinor, stipendEligible } from "@/lib/offer";
import { earningsView } from "@/lib/earnings-view";

export const metadata: Metadata = {
  title: "Stipend",
  robots: { index: false, follow: false },
};

/**
 * "landed today" / "landed yesterday" / "landed 7 Oct 2026". Only the relative
 * words are lowercased mid-sentence; a month abbreviation keeps its capital.
 */
function whenLabel(value: Date | string | null): string {
  const label = formatDayLabel(value);
  return /^(Today|Yesterday|Tomorrow|In \d+ days)$/.test(label) ? label.toLowerCase() : label;
}

/**
 * Stipend.
 *
 * ── The bug this fixes ─────────────────────────────────────────────────
 *
 * The old screen summed every payout row and labelled the result "Total paid
 * out". It did not filter by status, so a payout that was still pending was
 * counted as though the money had arrived. A student planning rent on that
 * number is being misinformed by our arithmetic, and the error is always in the
 * direction of over promising.
 *
 * So the two figures are now separated, and the incoming money is labelled as
 * incoming with the date it is expected, which is what makes it usable for
 * planning rather than merely reassuring.
 *
 * ── Why "expected" is not "due" ────────────────────────────────────────
 *
 * A scheduled date can move, and a payment date the product cannot control
 * should not be stated as a promise. The wording throughout is about what is
 * scheduled and what usually happens, never about what someone is owed by a
 * date the system does not control.
 */
export default async function InternEarnings() {
  const session = await requireRole("intern");

  const data = await loadInternData(session.uid);
  const { money } = data;

  const score = Number(((data.onboarding?.extraData ?? {}) as Record<string, unknown>).findternScore ?? 0) || 0;
  const eligible = stipendEligible(score);
  const engagementOffer = data.engagement ? parseOffer(data.engagement.offerDetails, data.engagement.currency) : null;
  const monthly = engagementOffer ? (internStipendInrMinor(engagementOffer, score) ?? 0) : 0;
  // Legacy "remaining expected" (routes.ts:13525): the whole engagement at the
  // intern's share, less what is paid and what is already scheduled.
  const remainingMinor =
    engagementOffer && monthly > 0 && money.currency === "INR"
      ? Math.max(0, monthly * engagementOffer.months - money.paidMinor - money.incomingMinor)
      : 0;

  return (
    <div>
      <PageHead
        title="Your stipend"
        lede="What has been paid, what is on its way, and when each one landed."
      />

      {earningsView(data.payouts.length, Boolean(data.engagement)) === "empty" ? (
        <EmptyScene
          art
          title="No stipend yet"
          body="Your stipend starts when you start an internship. It is agreed in the offer, at a rate you can see before you accept, and it is paid to the bank account on your profile."
          who="Payment dates are set by the company, not by us"
          next={{ label: "See your offers", href: "/intern/proposals" }}
        />
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-8">
            {/* ── The two figures, kept apart on purpose ─────────── */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Surface className="p-6">
                <p className="text-sm text-ink-600">Paid to you so far</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.025em] text-ink-900">
                  {/* Static, never animated: a count-up shows in-between
                      figures (and stalls in a throttled tab), which reads as
                      a wrong amount. INR passes through unconverted. */}
                  {formatMoney(money.paidMinor, money.currency, { zeroLabel: false })}
                </p>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
                  {money.lastPaidAt
                    ? `Last one landed ${whenLabel(money.lastPaidAt)}.`
                    : "Nothing has been paid out yet."}
                </p>
              </Surface>

              <Surface
                className={
                  money.incomingMinor > 0
                    ? "border-accent-300/60 bg-accent-100/40 p-6"
                    : "p-6"
                }
              >
                <p className="text-sm text-ink-600">On its way</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.025em] text-ink-900">
                  {money.incomingMinor > 0 ? formatMoney(money.incomingMinor, money.currency, { zeroLabel: false }) : "Nothing"}
                </p>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
                  {money.nextExpectedAt
                    ? `Scheduled for ${whenLabel(money.nextExpectedAt)}. It usually arrives within two working days of that date.`
                    : "Nothing is scheduled yet. The date appears here as soon as it is set."}
                </p>
              </Surface>
            </div>

            {/* ── Every payment ──────────────────────────────────── */}
            <section>
              <SectionHead title="Every payment" hint="Newest first, with the bank reference." />
              {data.payouts.length === 0 ? (
                <Surface className="p-5">
                  <p className="text-pretty text-sm leading-relaxed text-ink-600">
                    No payment has been recorded yet. Your first one is scheduled once your first
                    month is approved, and appears here with its date.
                  </p>
                </Surface>
              ) : (
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-[20px] border border-ink-200/70 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
                {data.payouts.map((payout) => {
                  const isPaid = payout.status === "paid";
                  return (
                    <li key={payout.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
                      <span
                        className={
                          isPaid
                            ? "grid size-9 shrink-0 place-items-center rounded-full bg-success-soft text-success"
                            : "grid size-9 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700"
                        }
                        aria-hidden
                      >
                        {isPaid ? (
                          <ArrowDownRight className="size-4" strokeWidth={2.5} />
                        ) : (
                          <Clock3 className="size-4" strokeWidth={2.5} />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold tabular-nums text-ink-900">
                          {formatMoney(payout.amountMinor ?? 0, payout.currency ?? "INR", { zeroLabel: false })}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-600">
                          {payout.referenceId ? (
                            <>
                              Reference {payout.referenceId}
                              {isPaid && payout.paidAt
                                ? ` · landed ${whenLabel(payout.paidAt)}`
                                : ""}
                            </>
                          ) : payout.notes ? (
                            payout.notes
                          ) : (
                            "Scheduled"
                          )}
                        </p>
                      </div>

                      <Pill tone={isPaid ? "paid" : "waiting"}>
                        {isPaid ? "Paid" : "Scheduled"}
                      </Pill>
                    </li>
                  );
                })}
              </ul>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            {data.engagement && !eligible ? (
              <Surface className="p-5">
                <SectionHead title="Your rate" />
                <p className="mt-2 text-lg font-semibold text-ink-900">Not eligible for stipend</p>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
                  Candidates with a Findtern Score below 6 are not paid a stipend. Re-scoring
                  above 6 makes later engagements paid.
                </p>
              </Surface>
            ) : null}
            {remainingMinor > 0 ? (
              <Surface className="p-5">
                <SectionHead title="Still to come" />
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.025em] text-ink-900">
                  {formatMoney(remainingMinor, "INR")}
                </p>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-600">
                  The rest of this internship at your monthly rate, less what has been paid or
                  scheduled. It firms up as each month is approved.
                </p>
              </Surface>
            ) : null}
            {monthly > 0 ? (
              <Surface className="p-5">
                <SectionHead title="Your rate" />
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.025em] text-ink-900">
                  {formatMoney(monthly, "INR")}
                </p>
                <p className="mt-1 text-sm text-ink-600">a month</p>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-600">
                  Agreed in your offer, visible before you accepted it, and never renegotiated
                  behind your back.
                </p>
              </Surface>
            ) : null}

            <Surface className="p-5">
              <SectionHead
                title="How payment works"
                action={<Info className="size-4 text-ink-400" aria-hidden />}
              />
              <ol className="mt-3 space-y-3">
                {[
                  "Your bank details are on your profile. Without them no stipend can be sent.",
                  "The company sets a payment date. You see it here as soon as it exists.",
                  "Each payment carries a bank reference so you can match it against your statement.",
                  "Every payment is added to your record as proof of work you were paid for.",
                ].map((line, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
                      {i + 1}
                    </span>
                    <span className="text-pretty text-sm leading-relaxed text-ink-600">{line}</span>
                  </li>
                ))}
              </ol>
            </Surface>

            <Link
              href="/intern/profile"
              className="apple-spring apple-pressable flex items-center justify-between gap-3 rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] hover:border-ink-200"
            >
              <span className="text-sm font-medium text-ink-800">
                Check your bank details
              </span>
              <ArrowRight className="size-4 shrink-0 text-ink-400" aria-hidden />
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}