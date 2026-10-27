import { cn } from "@/lib/utils";
import { Pill, type Tone } from "@/components/app/primitives";
import { humanizeStatus } from "@/components/app/status";

export { humanizeStatus };

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * Admin tones render through the one `Pill` (DESIGN.md §0: status always via
 * Pill tones). `danger` is the only tone Pill has no slot for: failures and
 * rejections keep a red pill so a failed payout never reads like a closed one.
 */
const PILL_TONE: Record<StatusTone, Tone> = {
  success: "live",
  warning: "waiting",
  danger: "neutral",
  info: "new",
  neutral: "closed",
};
const DANGER = "bg-danger-soft text-danger ring-danger/25";

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
  className,
}: {
  /** Raw status from the database. Ignored when `tone` is given. */
  value?: string | null;
  /** Alias for value. */
  status?: string | null;
  /** Force a tone, for values the map does not cover. */
  tone?: StatusTone;
  label?: string;
  className?: string;
}) {
  const val = value ?? status;
  const resolved = tone ?? toneForStatus(val);
  const text = label ?? (val ? humanizeStatus(val) : "None");

  return (
    <Pill
      tone={!tone && val?.toLowerCase() === "paid" ? "paid" : PILL_TONE[resolved]}
      className={cn("shrink-0 whitespace-nowrap", resolved === "danger" && DANGER, className)}
    >
      {text}
    </Pill>
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
    return <StatusBadge tone="neutral" label="-" />;
  }
  return (
    <StatusBadge
      tone={value ? trueTone : falseTone}
      label={value ? trueLabel : falseLabel}
    />
  );
}
