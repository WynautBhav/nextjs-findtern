import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, ShieldCheck } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { and, eq } from "drizzle-orm";
import { payableCheckout, type PayableLine } from "@/lib/employer-payable";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { CheckoutPay } from "@/components/payments/checkout-pay";

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
 * One Razorpay order per currency total: an order is single-currency, and
 * converting silently would bill the wrong amount. The totals come from
 * `payableCheckout` (lib/employer-payable), which the order route also calls
 * to recompute the charge server-side — the client only carries ids, so an
 * edited request cannot change the price. The verify route checks the HMAC
 * signature before a row counts as paid, and paid rows land in
 * `employer_payments`, which /employer/orders reads.
 */

export default async function EmployerCheckout() {
  const session = await getSession();
  const uid = session!.uid;

  let lines: PayableLine[] = [];
  let totals = new Map<PayableLine["currency"], number>();
  let defaultCurrency: PayableLine["currency"] = "INR";
  let hasPlans = false;
  let prefill: { name?: string; email?: string; contact?: string } = {};
  let stagedCount = 0;

  try {
    const result = await payableCheckout(uid);
    lines = result.lines;
    totals = result.totals;
    defaultCurrency = result.defaultCurrency;
    hasPlans = result.hasPlans;
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
    // DB unavailable — the page still states plainly that nothing is payable.
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
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/employer/proposals"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              <Receipt className="size-4" aria-hidden />
              Your proposals
            </Link>
            <Link
              href="/employer/cart"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
            >
              View cart
              {stagedCount > 0 ? ` (${stagedCount} staged)` : ""}
            </Link>
          </div>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-3">
            {lines.map((line) => (
              <article key={line.id} className="rounded-xl border border-ink-100 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/employer/intern/${encodeURIComponent(line.internId)}`}
                      className="font-semibold text-ink-900 underline-offset-4 hover:underline"
                    >
                      {line.internName}
                    </Link>
                    <p className="mt-0.5 text-sm text-text-subtle">
                      {line.roleTitle}
                      {line.projectName ? ` · ${line.projectName}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-ink-500">
                      {line.durationLabel}
                      {line.monthly > 0
                        ? ` · ${formatMoney(Math.round(line.monthly * 100), line.currency)}/month`
                        : " · no monthly amount recorded"}
                    </p>
                    <p className="mt-1 text-2xs text-text-subtle">
                      Total{" "}
                      {line.source === "offer"
                        ? "taken from the accepted offer"
                        : "recomputed from the score band — the offer did not record one"}
                      .
                    </p>
                  </div>

                  <dl className="w-full shrink-0 space-y-2 sm:w-56">
                    <Line label="Internship">
                      {formatMoney(Math.round(line.internshipTotal * 100), line.currency)}
                    </Line>
                    <Line label="Per-hire">
                      {line.perHire > 0
                        ? formatMoney(Math.round(line.perHire * 100), line.currency)
                        : "Waived at this score"}
                    </Line>
                    <div className="border-t border-ink-100 pt-2">
                      <Line label="Total" strong>
                        {formatMoney(
                          Math.round((line.internshipTotal + line.perHire) * 100),
                          line.currency,
                        )}
                      </Line>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
            <section className="rounded-xl border border-ink-100 bg-white p-5">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                Order total
              </p>
              <ul className="mt-4 space-y-2.5">
                {Array.from(totals.entries()).map(([code, total]) => (
                  <li key={code} className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-text-subtle">{code}</span>
                    <span className="text-lg font-semibold tabular-nums tracking-tight text-ink-900">
                      {formatMoney(Math.round(total * 100), code)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-ink-100 pt-3 text-xs leading-relaxed text-text-subtle">
                Mixed currencies are listed separately rather than converted. There is no FX rate
                in this build, and inventing one silently is how employers end up paying the wrong
                amount. Each currency is paid as its own Razorpay order.
              </p>
              <div className="mt-4 space-y-3">
                {Array.from(totals.entries()).map(([code, total]) => (
                  <CheckoutPay
                    key={code}
                    employerId={uid}
                    currency={code}
                    amountMinor={Math.round(total * 100)}
                    prefill={prefill}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-ink-100 bg-white p-5">
              <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                <ShieldCheck className="size-3.5" aria-hidden />
                On the amounts
              </p>
              <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-ink-600">
                <li>
                  Money in <code className="font-mono">offer_details</code> is in major units; the{" "}
                  <code className="font-mono">employer_payments</code> column is minor. The{" "}
                  <code className="font-mono">×100</code> here is that conversion.
                </li>
                <li>
                  {hasPlans
                    ? "Bands were resolved against the active pricing_plans rows where the offer did not carry a total."
                    : "No pricing_plans row was reachable, so band rates come from lib/score.ts."}
                </li>
                <li>
                  The charge is recomputed on the server from the same accepted offers before the
                  Razorpay order is created — what you see is what the gateway charges.
                </li>
                <li>
                  Your default currency is {defaultCurrency}, inferred from the country code on
                  your account.
                </li>
              </ul>
            </section>
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
