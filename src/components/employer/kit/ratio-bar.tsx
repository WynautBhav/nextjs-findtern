import { cn } from "@/lib/utils";

/**
 * Sent vs accepted for one internship: a hatched track for everything sent,
 * a solid brand fill for the accepted share. Pure CSS, real counts.
 */
export function RatioBar({ sent, accepted, className }: { sent: number; accepted: number; className?: string }) {
  const pct = sent > 0 ? Math.min(100, Math.round((accepted / sent) * 100)) : 0;
  return (
    <div className={cn("min-w-0", className)}>
      <dl className="flex items-end gap-6">
        <div>
          <dt className="text-xs font-medium text-text-subtle">Sent</dt>
          <dd className="nums text-3xl font-light leading-none tracking-[-0.04em] text-ink-900">{sent}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-subtle">Accepted</dt>
          <dd className="nums text-3xl font-light leading-none tracking-[-0.04em] text-brand-700">{accepted}</dd>
        </div>
      </dl>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-[repeating-linear-gradient(135deg,var(--color-ink-200)_0_3px,transparent_3px_6px)]"
        role="img"
        aria-label={sent > 0 ? `${accepted} of ${sent} accepted` : "Nothing sent yet"}
      >
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
