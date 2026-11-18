"use client";

import { useState } from "react";
import Link from "next/link";

import { SuccessMoment } from "@/components/app/success-moment";
import { buttonClass } from "@/components/ui/button";

import { InternOfferDecision } from "./offer-decision";

type DecisionProps = Omit<React.ComponentProps<typeof InternOfferDecision>, "onDecided">;

/**
 * The offer page's decision slot. It stays mounted through the server refresh that follows an answer (the page
 * swaps the buttons for "where this stands"), so the outcome it shows is not torn down mid-animation.
 * Accepting ends in the one celebratory moment; turning down is a plain, quiet confirmation.
 */
export function DecisionPanel({ open, after, ...decision }: DecisionProps & { open: boolean; after: React.ReactNode }) {
  const [outcome, setOutcome] = useState<"accepted" | "declined" | null>(null);

  if (outcome === "accepted") {
    const joining = decision.joiningDate ?? decision.startDate;
    return (
      <SuccessMoment
        title={decision.fullTime ? "You're hired" : "Offer accepted"}
        body={
          decision.fullTime
            ? `Accepting this full-time offer makes you hired${joining ? `. Join on ${new Date(joining).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}` : ""}.`
            : `${decision.company} completes the payment next. Logging hours opens once they do, and your stipend starts after that.`
        }
        actions={
          <Link href="/intern/proposals" className={buttonClass({ variant: "outline" })}>
            All offers
          </Link>
        }
      />
    );
  }
  if (outcome === "declined") {
    return (
      <div role="status" tabIndex={-1} className="outline-none">
        <p className="font-display text-lg font-semibold text-ink-900">Offer turned down</p>
        <p className="mt-1 text-pretty text-sm text-ink-700">It stays in your offers as rejected. This can&apos;t be undone.</p>
      </div>
    );
  }
  return open ? <InternOfferDecision {...decision} onDecided={setOutcome} /> : <>{after}</>;
}
