import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { formatMoney } from "@/lib/format";
import { and, eq } from "drizzle-orm";
import { payableCheckout, type PayableLine } from "@/lib/employer-payable";
import { displayNameOf } from "@/lib/employer-candidates";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { CheckoutSummary } from "@/components/payments/checkout-summary";
import { paymentsAreFree } from "@/lib/razorpay";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/**
 * Checkout.
 *
 * The payable set is *accepted* proposals, which is what the legacy checkout
 * billed (employer-checkout.tsx:311, `rawAccepted`). A cart row is an
 * intention; an accepted proposal is a commitment, and only the second is worth
 * taking money for.
 *
 * ── Payment ─────────────────────────────────────────────────────────────
 * One hire per Razorpay order (legacy checkout), in the currency of the
 * company's country. A new hire is paid month by month where the offer allows
 * it (score 6+, not full time), or upfront for the discount. A monthly
 * placement that is already running shows up here when its next month is due. The totals come from
 * `payableCheckout` (lib/employer-payable), which the order route also calls
 * to recompute the charge server-side - the client only carries ids, so an
 * edited request cannot change the price. The verify route checks the HMAC
 * signature before a row counts as paid, and paid rows land in
 * `employer_payments`, which /employer/orders reads.
 */

export default async function EmployerCheckout() {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const uid = session.uid;

  let lines: PayableLine[] = [];
  let prefill: { name?: string; email?: string; contact?: string } = {};
  let stagedCount = 0;

  try {
    const result = await payableCheckout(uid);
    lines = result.lines;
    prefill = result.prefill;

    const db = getDb();
    stagedCount = await db
      .select({ id: schema.employerCartItems.id })
      .from(schema.employerCartItems)
      .where(
        and(
          eq(schema.employerCartItems.employerId, uid),
          eq(schema.employerCartItems.listType, "checkout"),
        ),
      )
      .then((rows) => rows.length);
  } catch {
    // DB unavailable - the page still states plainly that nothing is payable.
  }

  return (
    <div>
      <PageHeader
        title="Checkout"
        subtitle="Settled on the terms each candidate accepted, not on cart estimates."
      />

      {lines.length === 0 ? (
        <>
          <EmptyState
            title="Nothing to pay for yet"
            body="Checkout bills accepted proposals. Nothing has been accepted, so there is no payable total."
            action={{ label: "Your proposals", href: "/employer/proposals" }}
            who="Candidates - accept your offers"
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink
              href="/employer/cart"
              variant="outline"
              size="sm"
              className="min-h-11 px-4 text-sm font-medium"
            >
              View cart
              {stagedCount > 0 ? ` (${stagedCount} staged)` : ""}
            </ButtonLink>
          </div>
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-3">
            {lines.map((line) => (
              <article key={line.id} className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/employer/intern/${encodeURIComponent(line.internId)}`}
                      className="font-semibold text-ink-900 underline-offset-4 hover:underline"
                    >
                      {displayNameOf(
                        { fullName: line.internName, initials: line.internInitials },
                        line.nameUnlocked,
                      )}
                    </Link>
                    <p className="mt-0.5 text-sm text-text-subtle">
                      {line.roleTitle}
                      {line.projectName ? ` · ${line.projectName}` : ""}
                    </p>
                    <p className="mt-2 text-xs tabular-nums text-ink-600">
                      {line.durationLabel}
                      {line.monthlyMinor != null
                        ? ` · ${formatMoney(line.monthlyMinor, line.currency)}/month`
                        : ""}
                    </p>
                  </div>

                  <dl className="w-full shrink-0 space-y-2 sm:w-56">
                    <Line label="Engagement">{formatMoney(line.charge.baseMinor - line.charge.perHireMinor, line.currency, { zeroLabel: false })}</Line>
                    {line.charge.perHireMinor > 0 ? (
                      <Line label="Hiring fee (one-time)">{formatMoney(line.charge.perHireMinor, line.currency)}</Line>
                    ) : null}
                    {line.charge.discountMinor > 0 ? (
                      <Line label="Upfront discount (10%)">−{formatMoney(line.charge.discountMinor, line.currency)}</Line>
                    ) : null}
                    <div className="border-t border-ink-100 pt-2">
                      <Line label={line.due ? "Due this month" : "Total upfront"} strong>
                        {formatMoney(line.charge.totalMinor, line.currency, { zeroLabel: false })}
                      </Line>
                    </div>
                    {!line.due && !line.monthlyCharge.monthlyBlocked ? (
                      <Line label="Or monthly">
                        {formatMoney(line.monthlyCharge.totalMinor, line.currency, { zeroLabel: false })}/month
                      </Line>
                    ) : null}
                  </dl>
                </div>
              </article>
            ))}
          </div>

          <aside className="min-w-0 space-y-4 xl:sticky xl:top-8 xl:self-start">
            <CheckoutSummary
              employerId={uid}
              testMode={paymentsAreFree()}
              prefill={prefill}
              lines={lines.map((line) => ({
                id: line.id,
                label: `${displayNameOf({ fullName: line.internName, initials: line.internInitials }, line.nameUnlocked)} · ${line.roleTitle}`,
                currency: line.currency,
                // A running monthly placement is already priced as its due month.
                upfrontMinor: line.charge.totalMinor,
                monthlyMinor: line.due || !line.monthlyCharge.monthlyBlocked ? line.monthlyCharge.totalMinor : null,
                monthlyBlocked: line.monthlyCharge.monthlyBlocked,
                due: Boolean(line.due),
                months: line.months,
              }))}
            />

            <p className="flex items-start gap-1.5 px-1 text-xs leading-relaxed text-text-subtle">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Pay month by month, or the whole engagement upfront for 10% off (candidates scoring 6 or more).
              Amounts are recalculated on our side before you pay.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function Line({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd
        className={
          strong
            ? "text-sm font-semibold tabular-nums text-ink-900"
            : "text-sm font-medium tabular-nums text-ink-800"
        }
      >
        {children}
      </dd>
    </div>
  );
}
