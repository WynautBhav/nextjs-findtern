import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, Clock3, Info } from "lucide-react";

import { EmptyScene, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { CountUp } from "@/components/app/count-up";
import { requireRole } from "@/lib/auth";
import { loadInternData } from "@/lib/intern-data";
import { formatDayLabel, formatMoney } from "@/lib/format";
import { parseOffer, internStipendInrMinor } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Stipend",
  robots: { index: false, follow: false },
};

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

  const monthly = data.engagement
    ? (internStipendInrMinor(parseOffer(data.engagement.offerDetails, data.engagement.currency)) ?? 0)
    : 0;

  return (
    <div>
      <PageHead
        title="Your stipend"
        lede="What has been paid, what is on its way, and when each one landed."
      />

      {data.payouts.length === 0 ? (
        <EmptyScene
          art
          title="No stipend yet"
          body="Your stipend starts when you start an internship. It is agreed in the offer, at a rate you can see before you accept, and it is paid to the bank account on your profile."
          who="Payment dates are set by the company, not by us"
          next={{ label: "See your offers", href: "/intern/proposals" }}
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-8">
            {/* ── The two figures, kept apart on purpose ─────────── */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Surface className="p-6">
                <p className="text-sm text-ink-500">Paid to you so far</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.025em] text-ink-900">
                  <CountUp value={money.paidMinor / 100} currency={money.currency} />
                </p>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-500">
                  {money.lastPaidAt
                    ? `Last one landed ${formatDayLabel(money.lastPaidAt).toLowerCase()}.`
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
                    ? `Scheduled for ${formatDayLabel(money.nextExpectedAt)}. It usually arrives within two working days of that date.`
                    : "Nothing is scheduled yet. The date appears here as soon as it is set."}
                </p>
              </Surface>
            </div>

            {/* ── Every payment ──────────────────────────────────── */}
            <section>
              <SectionHead title="Every payment" hint="Newest first, with the bank reference." />
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
                        <p className="mt-0.5 text-xs text-ink-500">
                          {payout.referenceId ? (
                            <>
                              Reference {payout.referenceId}
                              {isPaid && payout.paidAt
                                ? ` · landed ${formatDayLabel(payout.paidAt).toLowerCase()}`
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
            </section>
          </div>

          <aside className="space-y-4">
            {monthly > 0 ? (
              <Surface className="p-5">
                <SectionHead title="Your rate" />
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.025em] text-ink-900">
                  {formatMoney(monthly, "INR")}
                </p>
                <p className="mt-1 text-sm text-ink-500">a month</p>
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