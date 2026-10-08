import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<
  StatusTone,
  { pill: string; dot: string; pulse: boolean }
> = {
  success: {
    pill: "bg-emerald-50/90 text-emerald-800 ring-emerald-600/25 border border-emerald-200/50",
    dot: "bg-emerald-600",
    pulse: true,
  },
  warning: {
    pill: "bg-amber-50/90 text-amber-800 ring-amber-600/25 border border-amber-200/50",
    dot: "bg-amber-600",
    pulse: true,
  },
  danger: {
    pill: "bg-rose-50/90 text-rose-800 ring-rose-600/25 border border-rose-200/50",
    dot: "bg-rose-600",
    pulse: false,
  },
  info: {
    pill: "bg-blue-50/90 text-blue-800 ring-blue-600/25 border border-blue-200/50",
    dot: "bg-blue-600",
    pulse: false,
  },
  neutral: {
    pill: "bg-sand-100/90 text-ink-700 ring-sand-300/50 border border-sand-200/60",
    dot: "bg-ink-400",
    pulse: false,
  },
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

/** "interview_scheduled" → "Interview scheduled" */
export function humanizeStatus(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  if (!spaced) return "None";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

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
  const style = TONES[resolved];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold ring-1 ring-inset shadow-2xs",
        style.pill,
        className
      )}
    >
      <span aria-hidden className="relative flex size-1.5 items-center justify-center">
        {style.pulse ? (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-40",
              style.dot
            )}
          />
        ) : null}
        <span className={cn("relative inline-flex size-1.5 rounded-full", style.dot)} />
      </span>
      <span>{text}</span>
    </span>
  );
}

/** Boolean as a badge — used for visibility and setup-state columns. */
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
    return <StatusBadge tone="neutral" label="—" />;
  }
  return (
    <StatusBadge
      tone={value ? trueTone : falseTone}
      label={value ? trueLabel : falseLabel}
    />
  );
}
