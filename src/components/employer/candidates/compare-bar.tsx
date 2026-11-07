import Link from "next/link";
import { Scale } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { KeepFocusClear } from "@/components/app/keep-focus-clear";
import { cn } from "@/lib/utils";

/**
 * Floating compare tray: dark glass over the list, a dot per slot, and the
 * screen's one amber action once two are picked.
 */
export function CompareBar({
  count,
  max,
  clearHref,
  compareHref,
}: {
  count: number;
  max: number;
  clearHref: string;
  compareHref: string;
}) {
  const full = count >= max;
  return (
    <div
      id="compare-bar"
      role="region"
      aria-label="Compare selection"
      className="rise fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-[28px] bg-ink-900/85 px-5 py-3 text-white shadow-[0_24px_60px_-16px_rgb(4_29_23/0.6)] ring-1 ring-inset ring-white/10 backdrop-blur-xl sm:w-max sm:max-w-[calc(100%-2rem)] sm:rounded-full lg:bottom-6 lg:left-[calc(50%+var(--console-rail,0rem)/2)] lg:max-w-[calc(100%-var(--console-rail,0rem)-4rem)]"
    >
      <KeepFocusClear of="compare-bar" />
      <span aria-hidden className="flex items-center gap-1.5">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={cn("size-2.5 rounded-full transition-colors", i < count ? "bg-accent" : "bg-white/25")} />
        ))}
      </span>
      <span className="text-sm font-medium">
        {count === 1 ? "1 selected · pick one more to compare" : `${count} of ${max} selected${full ? " · limit reached" : ""}`}
      </span>
      <Link href={clearHref} scroll={false} className="apple-spring inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">
        Clear
      </Link>
      {count >= 2 ? (
        <ButtonLink href={compareHref} variant="accent" size="sm" className="min-h-11 rounded-full">
          <Scale className="size-4" aria-hidden />
          Compare side by side
        </ButtonLink>
      ) : null}
    </div>
  );
}
