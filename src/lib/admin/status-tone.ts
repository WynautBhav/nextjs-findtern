/**
 * One status → colour mapping for every admin pill (StatusBadge, the inline
 * select pills, the list cells). The tones are the semantic feedback tokens in
 * globals.css (`success|warning|danger|info` plus `-soft`); nothing here adds a token.
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/** A pastel pill: the tone's soft fill with the same hue's text and dot. */
export const TONE_CLASS: Record<StatusTone, { pill: string; dot: string }> = {
  success: { pill: "bg-success-soft text-success", dot: "bg-success" },
  warning: { pill: "bg-warning-soft text-warning", dot: "bg-warning" },
  danger: { pill: "bg-danger-soft text-danger", dot: "bg-danger" },
  info: { pill: "bg-info-soft text-info", dot: "bg-info" },
  neutral: { pill: "bg-ink-100 text-ink-700", dot: "bg-ink-500" },
};

export const TONE_BY_STATUS: Record<string, StatusTone> = {
  // accounts / visibility
  active: "success",
  inactive: "neutral",
  live: "success",
  hidden: "neutral",
  suspended: "danger",

  // AI interview and candidate pipeline
  not_applied: "neutral",
  applied: "info",
  waiting: "warning",
  interview_scheduled: "warning",
  scheduled: "warning",
  completed: "success",

  // proposals
  sent: "warning",
  accepted: "success",
  hired: "success",
  full_time: "info",
  rejected: "danger",
  declined: "danger",
  expired: "danger",
  withdrawn: "danger",
  void: "danger",
  draft: "neutral",

  // interviews
  pending: "warning",
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

/** Case, spaces and hyphens do not matter: "Interview Scheduled" is "interview_scheduled". Unknown is neutral. */
export function toneForStatus(value: string | null | undefined): StatusTone {
  if (!value) return "neutral";
  return TONE_BY_STATUS[String(value).trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? "neutral";
}
