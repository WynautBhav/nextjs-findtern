import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

/** Shortlist summary: a brand panel from lg, a bar fixed to the bottom on phones. */
export function CartSummary({
  ready,
  inProgress,
  target,
}: {
  ready: number;
  inProgress: number;
  target: { href: string; label: string; next: string } | null;
}) {
  return (
    <aside
      aria-label="Shortlist summary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/90 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl lg:sticky lg:top-24 lg:bottom-auto lg:overflow-hidden lg:rounded-[24px] lg:border-0 lg:bg-[linear-gradient(140deg,var(--color-brand-700),var(--color-brand-950))] lg:p-6 lg:text-white lg:shadow-tile-brand lg:backdrop-blur-none"
    >
      <div className="flex items-center gap-3 lg:block">
        <div className="min-w-0 flex-1">
          <p className="hidden text-[13px] font-medium text-on-dark-subtle lg:block">Ready for a proposal</p>
          <p className="text-[13px] font-medium text-text-subtle lg:mt-1.5 lg:text-on-dark-subtle">
            <span className="nums mr-1.5 text-4xl font-light leading-none tracking-[-0.04em] text-ink-900 lg:align-middle lg:text-[5rem] lg:leading-[0.9] lg:tracking-[-0.06em] lg:text-white">{ready}</span>
            <span className="lg:hidden">ready for a proposal</span>
            {inProgress > 0 ? (
              <>
                <span className="lg:hidden">, </span>
                <span className="lg:mt-3 lg:block">
                  <span className="nums font-semibold text-ink-900 lg:text-white">{inProgress}</span> already in progress
                </span>
              </>
            ) : null}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-text-subtle lg:mt-4 lg:line-clamp-none lg:text-on-dark-subtle">
            {target ? target.next : "Nothing to do here right now. Candidates you shortlist appear in this list."}
          </p>
        </div>
        {target ? (
          <ButtonLink href={target.href} size="sm" className="min-h-11 shrink-0 lg:mt-5 lg:w-full">
            {target.label}
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        ) : (
          <ButtonLink href="/employer/candidates" variant="outline" size="sm" className="min-h-11 shrink-0 lg:mt-5 lg:w-full">
            Browse candidates
          </ButtonLink>
        )}
      </div>
    </aside>
  );
}
