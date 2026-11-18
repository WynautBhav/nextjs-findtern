import { cn } from "@/lib/utils";

/**
 * The one brand-gradient hero on an employer screen: green wash, faint
 * contour lines, and a soft ambient glow behind the lead figure.
 */
export function HeroPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-apple-xl bg-gradient-to-br from-brand-600 via-brand-800 to-brand-950 p-6 text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_24px_48px_-24px_rgba(6,40,28,0.55),0_4px_12px_-4px_rgba(6,40,28,0.25)] sm:p-8",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 -z-10 size-[26rem] rounded-full bg-brand-400/25 blur-3xl" />
      <svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 size-full opacity-[0.07]" preserveAspectRatio="none">
        <defs>
          <pattern id="hp-lines" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
            <path d="M0 14H28" stroke="white" strokeWidth="1" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hp-lines)" />
      </svg>
      {children}
    </section>
  );
}

/** A figure on the hero: quiet label, large light number, hint. */
export function HeroFigure({ label, value, hint, lead = false }: { label: string; value: React.ReactNode; hint?: React.ReactNode; lead?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-on-dark-subtle">{label}</p>
      <p className={cn("nums mt-1.5 break-words font-light leading-none tracking-[-0.04em] tabular-nums", lead ? "text-[clamp(2.5rem,6vw,4.25rem)]" : "text-[clamp(1.75rem,3.4vw,2.5rem)]")}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-on-dark-subtle">{hint}</p> : null}
    </div>
  );
}
