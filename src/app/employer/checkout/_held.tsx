import Link from "next/link";
import { Send } from "lucide-react";

import { Section } from "@/components/app/stat";
import { buttonClass } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

export type ExpiredOffer = {
  id: string;
  /** Initials only ("Candidate AB"): checkout never shows a name before the hire. */
  who: string;
  roleTitle: string;
  projectName: string | null;
  /** YYYY-MM-DD the offer was to start. */
  startDate: string | null;
  sendHref: string;
};

/**
 * Accepted offers that can no longer be paid because their start day began. They are not in the payable list; each
 * has a path forward (a new proposal to the same candidate and project), and never a Pay button.
 */
export function ExpiredOffers({ offers, more }: { offers: ExpiredOffer[]; /** How many more are under Proposals > Closed. */ more: number }) {
  if (offers.length === 0) return null;
  return (
    <Section
      title="Expired offers"
      hint="Accepted but not paid before the start date, so they can no longer be paid. Send a new proposal to hire the same candidate."
      className="mt-12"
    >
      <ul className="divide-y divide-ink-200 border-b border-ink-200">
        {offers.map((o) => (
          <li key={o.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="break-words text-base font-medium text-ink-900">
                {o.roleTitle} <span className="font-normal text-ink-700">· {o.who}</span>
              </p>
              <p className="nums mt-0.5 break-words text-sm text-ink-700">
                {o.projectName ? `${o.projectName} · ` : ""}
                {o.startDate ? `Was to start ${formatDate(new Date(`${o.startDate}T00:00:00+05:30`))}` : "Start date passed"}
                <span className="text-ink-600"> · expired, not paid before start</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link href={`/employer/proposal/${encodeURIComponent(o.id)}`} className={buttonClass({ variant: "outline", className: "min-h-11" })} aria-label={`View ${o.roleTitle}, ${o.who}`}>
                View
              </Link>
              <Link href={o.sendHref} className={buttonClass({ variant: "outline", className: "min-h-11" })}>
                <Send className="size-4" aria-hidden />
                Send a new proposal
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-3 text-sm text-ink-700">
          <Link href="/employer/proposals?status=closed" className="inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-4">
            {more} older expired {more === 1 ? "offer" : "offers"} under Closed
          </Link>
        </p>
      ) : null}
    </Section>
  );
}

/** Accepted offers held back from the list above: Findtern is still confirming the candidate's CGPA, or a correction waits for the employer. */
export function VerifyingHeld({ count, needsConfirm }: { count: number; needsConfirm: number }) {
  if (count === 0) return null;
  return (
    <p className="mb-6 border-y border-ink-200 py-3 text-sm leading-relaxed text-ink-800">
      <span className="nums font-display text-lg font-semibold text-signal">{count}</span> accepted {count === 1 ? "offer is" : "offers are"} not payable yet: Findtern is confirming the candidate&apos;s CGPA (usually 24-48 h).
      {needsConfirm > 0 ? ` ${needsConfirm} ${needsConfirm === 1 ? "needs" : "need"} you to confirm a corrected CGPA.` : ""}{" "}
      <Link href="/employer/proposals?status=verifying" className="inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-4">
        See them under Verifying CGPA
      </Link>
    </p>
  );
}
