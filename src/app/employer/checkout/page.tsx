import Link from "next/link";
import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { payableCheckout, type PayableCheckout } from "@/lib/employer-payable";
import { TakedownBanner } from "@/components/employer/takedown-banner";
import { displayNameOf } from "@/lib/employer-candidates";
import { heldIds, hireFlowCounts, loadFlowProposals, type FlowProposal } from "@/lib/employer-flow";
import { initialsOf } from "@/lib/employer-candidates";
import { expireStaleEmployerOrders } from "@/lib/payments";
import { paymentsAreFree } from "@/lib/razorpay";
import { PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { HireFlow, type HireFlowCounts } from "@/components/employer/hire-flow";
import { CheckoutEmpty } from "./_empty";
import { ExpiredOffers, VerifyingHeld, type ExpiredOffer } from "./_held";
import { CheckoutSummary } from "@/components/payments/checkout-summary";
import { checkoutView, justPaid, selectCheckoutLines } from "@/lib/checkout-selection";

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
  searchParams: Promise<{ proposal?: string; proposalId?: string; paid?: string | string[] }>;
}) {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const uid = session.uid;
  const sp = await searchParams;

  let result: PayableCheckout | null = null;
  let counts: HireFlowCounts | null = null;
  let proposals: FlowProposal[] = [];
  try {
    await expireStaleEmployerOrders(uid).catch(() => 0);
    result = await payableCheckout(uid);
    // The same state the Proposals tabs read: an accepted offer is payable only when its CGPA check is clear and its
    // start day has not begun. (payableCheckout drops expired ones itself once the expiry rules land there; this
    // page never relies on that.)
    proposals = await loadFlowProposals(uid);
    const held = heldIds(proposals);
    counts = await hireFlowCounts(uid, result.lines.filter((l) => !held.has(l.id)).length, proposals);
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
  const held = heldIds(proposals);
  const payable = result.lines.filter((l) => !held.has(l.id));
  const selection = selectCheckoutLines(payable, sp.proposal ?? sp.proposalId);
  const lines = selection.lines;
  const othersDue = payable.length - lines.length;
  const verifyingHeld = proposals.filter((p) => p.state.verifying);
  // Expired and unpaid: newest start date first, a handful here and the rest under Proposals > Closed.
  const expiredAll = proposals
    .filter((p) => p.state.closedReason === "expired_unpaid")
    .sort((a, b) => String(b.offer.startDate ?? "").localeCompare(String(a.offer.startDate ?? "")));
  const expired: ExpiredOffer[] = expiredAll.slice(0, 5).map((p) => ({
    id: p.id,
    who: `Candidate ${initialsOf(p.firstName ?? "", p.lastName ?? "")}`.replace(/ \?$/, ""),
    roleTitle: p.offer.roleTitle || "Internship",
    projectName: p.projectName,
    startDate: p.offer.startDate ? p.offer.startDate.slice(0, 10) : null,
    sendHref: `/employer/send-proposal?intern=${encodeURIComponent(p.internId)}&project=${encodeURIComponent(p.projectId)}`,
  }));
  // A link to an offer that is held back says why, instead of "can't be paid here".
  const heldTarget = selection.missing ? proposals.find((p) => p.id === selection.requested && (p.state.verifying || p.state.closedReason === "expired_unpaid")) : undefined;
  const paid = justPaid(sp.paid);
  const view = checkoutView(selection, paid);
  return (
    <div>
      <PageHead
        title="Checkout"
        lede="Pay for an accepted offer to complete the hire. Each payment covers one candidate, on the terms they accepted."
      />
      {counts ? <HireFlow counts={counts} current="checkout" /> : null}
      <VerifyingHeld count={verifyingHeld.length} needsConfirm={verifyingHeld.filter((p) => p.state.gate?.state === "incorrect_unacked").length} />
      {result.blocked.length > 0 ? (
        <div className="mb-5 space-y-3">
          <TakedownBanner projects={[...new Map(result.blocked.map((b) => [b.projectId, { id: b.projectId, name: b.projectName ?? "This project" }])).values()]} />
          <ul aria-label="Not payable while taken down" className="space-y-1 text-sm text-ink-700">
            {result.blocked.map((b) => (
              <li key={b.id}><strong>{b.projectName ?? "Project"}</strong>: {b.note}. No payment can be made for it until admin restores the project.</li>
            ))}
          </ul>
        </div>
      ) : null}

      {view === "receipt" ? (
        <CheckoutEmpty
          title="Payment received"
          body="Your hire is confirmed. The placement and its invoice are under Orders."
          next={{ label: "Open orders and invoice", href: "/employer/orders" }}
          who="You - open Orders for the invoice"
          secondary={payable.length > 0 ? { label: `See what is still due (${payable.length})`, href: "/employer/checkout" } : undefined}
        />
      ) : view === "missing" && heldTarget ? (
        heldTarget.state.verifying ? (
          <CheckoutEmpty
            title="Not payable yet"
            body={
              heldTarget.state.gate?.state === "incorrect_unacked"
                ? "Findtern corrected the candidate's CGPA. Confirm the correction on the proposal to continue to payment."
                : "The candidate accepted. Findtern is confirming their CGPA (usually 24-48 h), and you can pay once it is confirmed."
            }
            next={{ label: "Open the proposal", href: `/employer/proposal/${encodeURIComponent(heldTarget.id)}` }}
            who="Findtern - confirms the CGPA"
            secondary={payable.length > 0 ? { label: `See what is due (${payable.length})`, href: "/employer/checkout" } : { label: "Back to proposals", href: "/employer/proposals" }}
          />
        ) : (
          <CheckoutEmpty
            title="This offer expired"
            body="It was not paid before its start date, so it can no longer be paid. Send a new proposal to hire this candidate."
            next={{ label: "Send a new proposal", href: `/employer/send-proposal?intern=${encodeURIComponent(heldTarget.internId)}&project=${encodeURIComponent(heldTarget.projectId)}` }}
            who="You - send a new proposal"
            secondary={payable.length > 0 ? { label: `See what is due (${payable.length})`, href: "/employer/checkout" } : { label: "Back to proposals", href: "/employer/proposals" }}
          />
        )
      ) : view === "missing" ? (
        // A link named a placement this page can't bill: say so, never show
        // a different hire in its place (QA-139).
        <CheckoutEmpty
          title="This placement can't be paid here"
          body="Checkout bills offers a candidate has accepted and the next month of a running monthly placement. The placement in your link is neither, so there is nothing to pay for it online. If you think you owe for it, write to us and we'll sort it out."
          next={
            payable.length > 0
              ? { label: `See what is due (${payable.length})`, href: "/employer/checkout" }
              : { label: "Back to orders", href: "/employer/orders" }
          }
          who="Findtern - write to communicate@findtern.in"
          secondary={payable.length > 0 ? { label: "Back to orders", href: "/employer/orders" } : undefined}
        />
      ) : view === "empty" ? (
        <CheckoutEmpty
          title="Nothing to pay yet"
          body="Checkout bills offers a candidate has accepted, and the next month of a running monthly placement. None are waiting right now."
          next={
            counts && counts.awaitingReply > 0
              ? { label: "Proposals awaiting a reply", href: "/employer/proposals" }
              : { label: "Open your shortlist", href: "/employer/cart" }
          }
          who={counts && counts.awaitingReply > 0 ? "Candidates - reply to your offers" : "You - send a proposal"}
          secondary={{ label: counts && counts.awaitingReply > 0 ? "Open your shortlist" : "Browse candidates", href: counts && counts.awaitingReply > 0 ? "/employer/cart" : "/employer/candidates" }}
        />
      ) : (
        <>
        {paid ? (
          <p role="status" className="mb-4 rounded-apple-md border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
            Payment received. The hire and its invoice are under <Link href="/employer/orders" className="font-semibold underline underline-offset-4">Orders</Link>. Your other accepted offers are still waiting below.
          </p>
        ) : null}
        <CheckoutSummary
          employerId={uid}
          testMode={paymentsAreFree()}
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
            feeWaivedListMinor: line.fee.kind === "free" ? line.fee.listMinor : 0,
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
              See everything due ({payable.length})
            </Link>
          </p>
        ) : null}
        </>
      )}
      <ExpiredOffers offers={expired} more={Math.max(0, expiredAll.length - expired.length)} />
    </div>
  );
}
