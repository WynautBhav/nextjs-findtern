import { cn } from "@/lib/utils";

/**
 * A plain progress bar for the college console. The fill never shrinks below a
 * visible bar (a 1% fill used to read as a lone dot), and the figure is always
 * printed beside it, so the bar is a glance and the number is the truth.
 */
export function Meter({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn("h-2.5 w-full overflow-hidden rounded-md bg-ink-200", className)}
    >
      <div
        className="h-full min-w-[0.5rem] rounded-md bg-brand-800 transition-[width] duration-[var(--motion-slow)] motion-reduce:transition-none"
        style={{ width: value > 0 ? `max(${pct}%, 0.5rem)` : "0" }}
      />
    </div>
  );
}
