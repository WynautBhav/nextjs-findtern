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
        "rounded-lg bg-brand-800 px-6 py-8 text-white sm:px-9 sm:py-10",
        className,
      )}
    >
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
        "rounded-lg bg-brand-800 text-white",
        className,
      )}
    >
      {children}
    </section>
  );
}
