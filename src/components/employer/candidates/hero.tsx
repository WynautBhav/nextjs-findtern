import Link from "next/link";
import { Bookmark, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The page's one hero: a brand gradient with contour lines and a slow ambient
 * glow behind the figure. The figure is the number of candidates matching the
 * current filters; the toolbar below carries the same number as a live status
 * for assistive tech, so this copy is decorative.
 */
export function CandidatesHero({
  total,
  shownFrom,
  shownTo,
  projectName,
  wholePool,
  shortlistedCount,
  loadFailed,
}: {
  total: number;
  shownFrom: number;
  shownTo: number;
  projectName: string | null;
  /** The employer chose "show everyone" over the project's defaults. */
  wholePool: boolean;
  shortlistedCount: number;
  loadFailed: boolean;
}) {
  const lede = projectName
    ? wholePool
      ? `The whole pool, not narrowed to ${projectName}.`
      : `Ranked for ${projectName}.`
    : "Create a project to rank the pool for it and to shortlist.";
  return (
    <section className="relative isolate mb-6 overflow-hidden rounded-[28px] bg-[linear-gradient(125deg,var(--color-brand-700)_0%,var(--color-brand-900)_52%,var(--color-brand-950)_100%)] text-white shadow-tile-brand">
      {/* Ambient light behind the figure; the one glow on the screen. */}
      <div aria-hidden className="glow-drift pointer-events-none absolute -right-24 -top-32 -z-10 size-[28rem] rounded-full bg-[radial-gradient(closest-side,rgb(245_187_99/0.34),rgb(245_187_99/0.08)_55%,transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/4 -z-10 size-[26rem] rounded-full bg-[radial-gradient(closest-side,rgb(92_151_131/0.28),transparent)]" />
      <svg aria-hidden viewBox="0 0 800 260" preserveAspectRatio="xMaxYMid slice" className="pointer-events-none absolute inset-0 -z-10 size-full text-white/[0.07]" fill="none" stroke="currentColor" strokeWidth="1.25">
        {Array.from({ length: 11 }, (_, i) => (
          <path key={i} d={`M${330 + i * 18} 290 C ${400 + i * 14} ${210 - i * 10}, ${520 + i * 9} ${160 - i * 12}, 820 ${130 - i * 16}`} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <ellipse key={`e${i}`} cx="700" cy="60" rx={30 + i * 26} ry={20 + i * 18} />
        ))}
      </svg>

      <div className="grid gap-6 px-6 py-7 sm:gap-8 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <h1 className="text-balance text-4xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-5xl">Candidates</h1>
          <p className="mt-3 max-w-xl text-pretty text-base text-on-dark-subtle sm:text-lg">{lede}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link
              href="/employer/cart"
              className="apple-spring inline-flex min-h-11 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-medium text-white ring-1 ring-inset ring-white/20 backdrop-blur-md hover:bg-white/20"
            >
              <Bookmark className="size-4" aria-hidden />
              Shortlist
              <span className="nums rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-brand-900">{shortlistedCount}</span>
            </Link>
            <Link
              href="/employer/projects"
              className="apple-spring inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-white/90 hover:bg-white/10"
            >
              <Plus className="size-4" aria-hidden />
              New project
            </Link>
          </div>
        </div>

        {loadFailed ? null : (
          <div aria-hidden className="rise lg:text-right">
            <p
              className={cn(
                "nums font-light leading-[0.85] tracking-[-0.06em] text-white",
                "text-[clamp(3.5rem,11vw,8rem)]",
              )}
            >
              {total}
            </p>
            <p className="mt-3 text-sm font-medium text-white/80">
              candidate{total === 1 ? "" : "s"} match
              {total > 0 ? <span className="nums text-white/60"> · showing {shownFrom}–{shownTo}</span> : null}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
