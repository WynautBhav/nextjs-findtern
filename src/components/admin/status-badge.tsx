import { cn } from "@/lib/utils";
import { humanizeStatus } from "@/components/app/status";
import { toneForStatus, TONE_CLASS, type StatusTone } from "@/lib/admin/status-tone";

export { humanizeStatus };

export { toneForStatus, TONE_CLASS, type StatusTone };

export function StatusBadge({
  value,
  status,
  tone,
  label,
  dot = true,
  className,
}: {
  /** Raw status from the database. Ignored when `tone` is given. */
  value?: string | null;
  /** Alias for value. */
  status?: string | null;
  /** Force a tone, for values the map does not cover. */
  tone?: StatusTone;
  label?: string;
  /** The 6px leading dot (default on). Colour is never the only signal: the label is always printed. */
  dot?: boolean;
  className?: string;
}) {
  const val = value ?? status;
  const resolved = tone ?? toneForStatus(val);
  const text = label ?? (val ? humanizeStatus(val) : "None");
  const classes = TONE_CLASS[resolved];

  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        classes.pill,
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", classes.dot)} /> : null}
      {text}
    </span>
  );
}

/** Boolean as a badge - used for visibility and setup-state columns. */
export function BooleanBadge({
  value,
  trueLabel = "Yes",
  falseLabel = "No",
  trueTone = "success",
  falseTone = "neutral",
}: {
  value: boolean | null | undefined;
  trueLabel?: string;
  falseLabel?: string;
  trueTone?: StatusTone;
  falseTone?: StatusTone;
}) {
  if (value === null || value === undefined) {
    return <StatusBadge tone="neutral" label="-" dot={false} />;
  }
  return (
    <StatusBadge
      tone={value ? trueTone : falseTone}
      label={value ? trueLabel : falseLabel}
    />
  );
}
