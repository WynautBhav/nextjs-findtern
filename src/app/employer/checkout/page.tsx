import Link from "next/link";
import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { payableCheckout, type PayableCheckout } from "@/lib/employer-payable";
import { displayNameOf } from "@/lib/employer-candidates";
import { hireFlowCounts } from "@/lib/employer-flow";
import { expireStaleEmployerOrders } from "@/lib/payments";
import { paymentsAreFree, testPayEnabled } from "@/lib/razorpay";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { HireFlow, type HireFlowCounts } from "@/components/employer/hire-flow";
import { CheckoutSummary } from "@/components/payments/checkout-summary";
import { selectCheckoutLines } from "@/lib/checkout-selection";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/**
 * Checkout.
 *
 * The payable set is *accepted* proposals, which is what the legacy checkout
 * billed (employer-checkout.tsx:311, `rawAccepted`), plus the next month of a
 * running monthly placement. A cart row is an intention; an accepted proposal
 * is a commitment, and only the second is worth taking money for.
 *
 * The totals come from `payableCheckout` (lib/employer-payable), which the
 * order route also calls to recompute the charge server-side: the client only
 * carries ids, so an edited request cannot change the price.
 */
export default async function EmployerCheckout({
  searchParams,
}: {
  searchParams: Promise<{ proposal?: string; proposalId?: string }>;
}) {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const uid = session.uid;
  const sp = await searchParams;

  let result: PayableCheckout | null = null;
  let counts: HireFlowCounts | null = null;
  try {
    await expireStaleEmployerOrders(uid).catch(() => 0);
    result = await payableCheckout(uid);
    counts = await hireFlowCounts(uid, result.lines.length);
  } catch (err) {
    console.error("[employer/checkout] load failed", err);
  }

  if (!result) {
    return (
      <div>
        <PageHead title="Checkout" />
        <LoadError
          what="your checkout"
          retryHref={
            sp.proposal ?? sp.proposalId
              ? `/employer/checkout?proposal=${encodeURIComponent((sp.proposal ?? sp.proposalId)!)}`
              : "/employer/checkout"
          }
          email={SITE.adminEmail}
        />
      </div>
    );
  }

  const { prefill } = result;
  const selection = selectCheckoutLines(result.lines, sp.proposal ?? sp.proposalId);
  const lines = selection.lines;
  const othersDue = result.lines.length - lines.length;
  return (
    <div>
      <PageHead
        title="Checkout"
        lede="Pay for an accepted offer to complete the hire. Each payment covers one candidate, on the terms they accepted."
      />
      {counts ? <HireFlow counts={counts} current="checkout" /> : null}

      {selection.missing ? (
        // A link named a placement this page can't bill: say so, never show
        // a different hire in its place (QA-139).
        <EmptyScene
          title="This placement can't be paid here"
          body="Checkout bills offers a candidate has accepted and the next month of a running monthly placement. The placement in your link is neither, so there is nothing to pay for it online. If you think you owe for it, write to us and we'll sort it out."
          next={
            result.lines.length > 0
              ? { label: `See what is due (${result.lines.length})`, href: "/employer/checkout" }
              : { label: "Back to orders", href: "/employer/orders" }
          }
          who="Findtern - write to communicate@findtern.in"
        />
      ) : lines.length === 0 ? (
        <EmptyScene
          art
          title="Nothing to pay yet"
          body="Checkout bills offers a candidate has accepted, and the next month of a running monthly placement. None are waiting right now."
          next={
            counts && counts.awaitingReply > 0
              ? { label: "Proposals awaiting a reply", href: "/employer/proposals" }
              : { label: "Open your shortlist", href: "/employer/cart" }
          }
          who={counts && counts.awaitingReply > 0 ? "Candidates - reply to your offers" : "You - send a proposal"}
        />
      ) : (
        <>
        <CheckoutSummary
          employerId={uid}
          testMode={paymentsAreFree()}
          testPay={testPayEnabled()}
          prefill={prefill}
          initialId={sp.proposal ?? sp.proposalId ?? null}
          lines={lines.map((line) => ({
            id: line.id,
            internId: line.internId,
            who: displayNameOf({ id: line.internId, fullName: line.internName, initials: line.internInitials }, line.nameUnlocked),
            roleTitle: line.roleTitle,
            projectName: line.projectName,
            currency: line.currency,
            durationLabel: line.durationLabel,
            monthlyRateMinor: line.monthlyMinor,
            feeMinor: line.charge.perHireMinor,
            // A running monthly placement is already priced as its due month.
            upfrontMinor: line.charge.totalMinor,
            monthlyMinor: line.due ? line.monthlyCharge.totalMinor : null,
            postpaidMinor: !line.due && !line.charge.monthlyBlocked ? line.feeCharge.totalMinor : null,
            schedule: line.schedule,
            monthlyBlocked: line.monthlyCharge.monthlyBlocked,
            due: Boolean(line.due),
            monthsPaid: line.due?.monthsPaid ?? 0,
            dueOn: line.dueOn,
            months: line.months,
            fullTimeCtcMinor: line.fullTime ? line.fullTimeCtcMinor ?? 0 : null,
          }))}
        />
        {othersDue > 0 ? (
          <p className="mt-4 text-sm text-ink-600">
            This page shows the placement from your link.{" "}
            <Link href="/employer/checkout" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              See everything due ({result.lines.length})
            </Link>
          </p>
        ) : null}
        </>
      )}
    </div>
  );
}
