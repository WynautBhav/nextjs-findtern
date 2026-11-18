import { cn } from "@/lib/utils";

/**
 * The bold-pass hero: brand gradient (600 to 950), a faint contour texture and
 * one ambient glow behind the lead figure. Same slots as HeroBand so a page can
 * swap one for the other. One per screen.
 */
export function SignatureHero({
  title,
  lede,
  actions,
  aside,
  children,
  className,
  compact = false,
}: {
  compact?: boolean;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-apple-xl bg-brand-950 px-6 py-8 text-white shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_1px_2px_rgba(4,29,23,0.25),0_18px_40px_-18px_rgba(4,29,23,0.5)] sm:px-9 sm:py-10",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,var(--color-brand-600)_-20%,var(--color-brand-950)_62%)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-32 -z-10 size-[26rem] rounded-full bg-[radial-gradient(closest-side,rgba(127,212,178,0.28),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:repeating-radial-gradient(circle_at_85%_0%,#fff_0_1px,transparent_1px_22px)]"
      />
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 max-w-2xl flex-col gap-6">
          <div>
            <h1 className={cn("text-balance break-words font-medium leading-[1.04] tracking-[-0.035em]", compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl")}>{title}</h1>
            {lede ? <p className="mt-3 max-w-xl text-pretty text-base leading-relaxed text-on-dark-subtle sm:text-lg">{lede}</p> : null}
          </div>
          {actions ? <div className="flex w-full flex-wrap gap-3 sm:w-auto">{actions}</div> : null}
        </div>
        {aside ? <div className="shrink-0 lg:pr-4">{aside}</div> : null}
      </div>
      {children ? <div className="mt-8">{children}</div> : null}
    </section>
  );
}

/** A slim gradient panel carrying a page's key figures (dark FigureStrip inside). For pages whose hero is the numbers. */
export function FigurePanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-apple-xl bg-brand-950 text-white shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_18px_40px_-20px_rgba(4,29,23,0.55)]",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,var(--color-brand-600)_-30%,var(--color-brand-950)_65%)]" />
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-28 -z-10 size-80 rounded-full bg-[radial-gradient(closest-side,rgba(127,212,178,0.22),transparent)]" />
      {children}
    </section>
  );
}
