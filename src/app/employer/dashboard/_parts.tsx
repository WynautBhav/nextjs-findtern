import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

import { BANDS, PLAN_NAME } from "@/lib/score";
import { cn } from "@/lib/utils";

/** Presentational pieces of the employer dashboard that the page still shares between sections. Server components only. */

/** Link style for "All …" links: neutral, underline on hover. */
export const QUIET_LINK = "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline";

/** One header for every section: title left, optional link right, one baseline. */
export function SectionHead({ id, title, href, link }: { id: string; title: string; href?: string; link?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 id={id} className="scroll-mt-24 text-base font-semibold leading-6 text-ink-900">
        {title}
      </h2>
      {href && link ? (
        <Link href={href} className={cn(QUIET_LINK, "-my-2.5 shrink-0")}>
          {link}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/** What the score bands mean, once under the list. The row's number is the score; this says what each range is. */
export function ScoreBands() {
  return (
    <details className="group/legend border-b border-ink-100 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-medium text-ink-700 outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
        What the score bands mean
        <ChevronDown className="size-4 text-ink-500 transition-transform group-open/legend:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <dl className="grid gap-x-6 gap-y-2 pb-4 text-sm sm:grid-cols-3">
        {[...BANDS].reverse().map((band) => (
          <div key={band.id}>
            <dt className="font-medium text-ink-900">
              {PLAN_NAME[band.id]} <span className="nums font-normal text-ink-600">{band.max >= 10 ? `${band.min} or above` : `${band.min} to under ${band.max}`}</span>
            </dt>
            <dd className="text-ink-600">{band.blurb}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
