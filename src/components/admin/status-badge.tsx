import { cn } from "@/lib/utils";
import { humanizeStatus } from "@/components/app/status";

export { humanizeStatus };

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * A pastel pill: the tone's soft fill with the same hue's text and dot. The
 * soft/ink pairs are the semantic feedback tokens, which flip with the theme
 * and keep text at 4.5:1 or better in both (neutral uses the ink ramp).
 */
const TONE_CLASS: Record<StatusTone, { pill: string; dot: string }> = {
  success: { pill: "bg-success-soft text-success", dot: "bg-success" },
  warning: { pill: "bg-warning-soft text-warning", dot: "bg-warning" },
  danger: { pill: "bg-danger-soft text-danger", dot: "bg-danger" },
  info: { pill: "bg-info-soft text-info", dot: "bg-info" },
  neutral: { pill: "bg-ink-100 text-ink-700", dot: "bg-ink-500" },
};

const TONE_BY_STATUS: Record<string, StatusTone> = {
  // accounts / visibility
  active: "success",
  inactive: "neutral",
  live: "success",
  hidden: "neutral",
  suspended: "danger",

  // proposals
  sent: "info",
  accepted: "success",
  hired: "success",
  rejected: "danger",
  expired: "danger",
  withdrawn: "neutral",
  draft: "warning",
  interview_scheduled: "warning",

  // interviews
  pending: "warning",
  scheduled: "warning",
  completed: "success",
  missed: "danger",
  rescheduled: "info",
  cancelled: "neutral",

  // payments
  created: "neutral",
  paid: "success",
  processing: "info",
  failed: "danger",
  refunded: "warning",

  // timesheets
  submitted: "info",
  approved: "success",

  // misc
  read: "neutral",
  unread: "warning",
  complete: "success",
  incomplete: "warning",
  setup_completed: "success",
  setup_incomplete: "warning",
};

/** "interview_scheduled" → "Interview scheduled" - shared copy in app/status. */

export function toneForStatus(value: string | null | undefined): StatusTone {
  if (!value) return "neutral";
  return TONE_BY_STATUS[value.toLowerCase()] ?? "neutral";
}

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
