import Link from "next/link";
import { Hourglass, Send } from "lucide-react";

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
    <section aria-labelledby="expired-offers-h" className="mt-10">
      <h2 id="expired-offers-h" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
        Expired offers
      </h2>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-700">These were accepted but not paid before the start date, so they can no longer be paid. Send a new proposal to hire the same candidate.</p>
      <ul className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white">
        {offers.map((o) => (
          <li key={o.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-ink-900">
                {o.roleTitle} <span className="font-normal text-ink-700">· {o.who}</span>
              </p>
              <p className="nums mt-0.5 break-words text-sm text-ink-700">
                {o.projectName ? `${o.projectName} · ` : ""}
                {o.startDate ? `Was to start ${formatDate(new Date(`${o.startDate}T00:00:00+05:30`))}` : "Start date passed"}
              </p>
              <p className="mt-1 text-sm font-medium text-ink-800">Expired · not paid before start</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:w-56">
              <Link href={o.sendHref} className={buttonClass({ block: true, className: "min-h-11" })}>
                <Send className="size-4" aria-hidden />
                Send a new proposal
              </Link>
              <Link href={`/employer/proposal/${encodeURIComponent(o.id)}`} className={buttonClass({ variant: "outline", block: true, className: "min-h-11" })} aria-label={`View ${o.roleTitle}, ${o.who}`}>
                View
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-3 text-sm text-ink-700">
          <Link href="/employer/proposals?status=closed" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            {more} older expired {more === 1 ? "offer" : "offers"} under Closed
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/** Accepted offers held back from the list above: Findtern is still confirming the candidate's CGPA, or a correction waits for the employer. */
export function VerifyingHeld({ count, needsConfirm }: { count: number; needsConfirm: number }) {
  if (count === 0) return null;
  return (
    <p className="mb-5 flex items-start gap-3 rounded-2xl bg-accent-100/60 px-5 py-4 text-sm leading-relaxed text-ink-800">
      <Hourglass className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
      <span>
        <span className="nums font-semibold text-ink-900">{count}</span> accepted {count === 1 ? "offer is" : "offers are"} not payable yet: Findtern is confirming the candidate&apos;s CGPA (usually 24-48 h).
        {needsConfirm > 0 ? ` ${needsConfirm} ${needsConfirm === 1 ? "needs" : "need"} you to confirm a corrected CGPA.` : ""}{" "}
        <Link href="/employer/proposals?status=verifying" className="font-medium text-brand-700 underline underline-offset-4">
          See them under Verifying CGPA
        </Link>
      </span>
    </p>
  );
}
