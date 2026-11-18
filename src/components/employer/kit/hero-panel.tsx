import { cn } from "@/lib/utils";

/**
 * The one plain masthead (a hairline, no box) on an employer screen: no wash, no texture, no glow.
 */
export function HeroPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("border-b border-ink-200 pb-8", className)}>{children}</section>;
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
