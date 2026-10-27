import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { payableCheckout, type PayableCheckout } from "@/lib/employer-payable";
import { displayNameOf } from "@/lib/employer-candidates";
import { hireFlowCounts } from "@/lib/employer-flow";
import { expireStaleEmployerOrders } from "@/lib/payments";
import { paymentsAreFree } from "@/lib/razorpay";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { HireFlow, type HireFlowCounts } from "@/components/employer/hire-flow";
import { CheckoutSummary } from "@/components/payments/checkout-summary";

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
        <EmptyScene
          art
          title="Couldn't load your checkout"
          body="We couldn't reach your accepted offers just now, so there is nothing to pay from this page yet. No payment has been taken; try again in a moment."
          who="Us - connection issue"
          next={{ label: "Try again", href: "/employer/checkout" }}
        />
      </div>
    );
  }

  const { lines, prefill } = result;
  return (
    <div>
      <PageHead
        title="Checkout"
        lede="Pay for an accepted offer to complete the hire. Each payment covers one candidate, on the terms they accepted."
      />
      {counts ? <HireFlow counts={counts} current="checkout" /> : null}

      {lines.length === 0 ? (
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
        <CheckoutSummary
          employerId={uid}
          testMode={paymentsAreFree()}
          prefill={prefill}
          initialId={sp.proposal ?? sp.proposalId ?? null}
          lines={lines.map((line) => ({
            id: line.id,
            internId: line.internId,
            who: displayNameOf({ fullName: line.internName, initials: line.internInitials }, line.nameUnlocked),
            roleTitle: line.roleTitle,
            projectName: line.projectName,
            currency: line.currency,
            durationLabel: line.durationLabel,
            monthlyRateMinor: line.monthlyMinor,
            feeMinor: line.charge.perHireMinor,
            // A running monthly placement is already priced as its due month.
            upfrontMinor: line.charge.totalMinor,
            monthlyMinor: line.due || !line.monthlyCharge.monthlyBlocked ? line.monthlyCharge.totalMinor : null,
            monthlyBlocked: line.monthlyCharge.monthlyBlocked,
            due: Boolean(line.due),
            dueOn: line.dueOn,
            months: line.months,
            fullTimeCtcMinor: line.fullTime ? line.fullTimeCtcMinor ?? 0 : null,
          }))}
        />
      )}
    </div>
  );
}
