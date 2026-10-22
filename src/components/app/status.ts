import type { Tone } from "@/components/app/primitives";

/**
 * Single status vocabulary for every dashboard surface.
 *
 * Before this module the same database enum was rendered three ways:
 * `Pill tone=live|waiting|...` on intern screens, `StatusBadge
 * tone=success|warning|...` on admin screens, and inline
 * `bg-emerald-50 / bg-amber-50 / bg-blue-50` strings on employer screens -
 * plus four copies of a `humanize` helper and three copies of a
 * timesheet/interview tone map.
 *
 * Enums never reach a user. Every helper here returns a human phrase and a
 * `Pill` tone; admin `StatusBadge` keeps its own dot/pulse visuals but reads
 * the same human phrase from `humanizeStatus`.
 *
 * Server-safe: no client directive, so server pages and client components
 * can both import it.
 */

/** "interview_scheduled" → "Interview scheduled". Single copy. */
export function humanizeStatus(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  if (!spaced) return "None";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Candidate-facing proposal state. Moved verbatim from proposal-status. */
export function proposalStatus(status: string | null): {
  label: string;
  tone: Tone;
  detail: string;
} {
  switch ((status ?? "").toLowerCase()) {
    case "accepted":
      return {
        label: "You are doing this",
        tone: "live",
        detail: "Your timesheet and stipend are running.",
      };
    case "hired":
      return {
        label: "Converted to full time",
        tone: "paid",
        detail: "This became a permanent role.",
      };
    case "rejected":
      return { label: "Not this time", tone: "closed", detail: "Nothing more is needed from you." };
    case "interview_scheduled":
      return {
        label: "Interview booked",
        tone: "waiting",
        detail: "Waiting on the interview to happen.",
      };
    case "withdrawn":
      return { label: "Withdrawn", tone: "closed", detail: "The company closed this one." };
    case "expired":
      return { label: "Expired", tone: "closed", detail: "This offer ran out of time." };
    // Not stored: an offer the intern never answered, once its joining date
    // has passed. Intern pages derive it (bug sheet 21 Oct wording).
    case "lapsed":
      return {
        label: "Rejected · no response",
        tone: "closed",
        detail: "You did not respond before the joining date, so this offer was marked as rejected.",
      };
    case "draft":
      return { label: "Not sent yet", tone: "neutral", detail: "The company has not sent this." };
    default:
      return {
        label: "Waiting on you",
        tone: "waiting",
        detail: "Accept or turn it down before the joining date. If you do nothing, it is marked as rejected once the joining date passes.",
      };
  }
}

/** Intern timesheet period label. Moved from intern/timesheets. */
export function sheetLabel(status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "Approved";
    case "submitted":
      return "Sent for approval";
    case "rejected":
      return "Sent back to you";
    case "draft":
      return "Not sent yet";
    default:
      return humanizeStatus(status ?? "") === "None" ? "Unknown" : humanizeStatus(status ?? "");
  }
}

/** Intern timesheet period tone. Moved from intern/timesheets. */
export function sheetTone(status: string | null): Tone {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "paid";
    case "submitted":
      return "waiting";
    case "rejected":
      return "new";
    default:
      return "neutral";
  }
}

/** Employer interview row state. Replaces the local STATUS_TONE in schedule. */
export function interviewPill(status: string | null): { label: string; tone: Tone } {
  switch ((status ?? "").toLowerCase()) {
    case "scheduled":
    case "sent":
    case "completed":
      return { label: humanizeStatus(status ?? ""), tone: "live" };
    case "pending":
      return { label: humanizeStatus(status ?? ""), tone: "waiting" };
    case "missed":
    case "expired":
      return { label: humanizeStatus(status ?? ""), tone: "closed" };
    case "cancelled":
      return { label: humanizeStatus(status ?? ""), tone: "neutral" };
    default:
      return { label: humanizeStatus(status ?? ""), tone: "neutral" };
  }
}

/** Employer timesheet review state. Replaces timesheet-parts tones. */
export function timesheetPill(status: string | null): { label: string; tone: Tone } {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return { label: "Approved", tone: "paid" };
    case "rejected":
      return { label: "Rejected", tone: "closed" };
    case "submitted":
      return { label: "Submitted", tone: "waiting" };
    case "draft":
      return { label: "Draft", tone: "neutral" };
    default:
      return { label: humanizeStatus(status ?? ""), tone: "neutral" };
  }
}

/** Employer proposal row state. Replaces the five hand-rolled badges in
 *  proposals-manager (amber/emerald/rose/ink/blue). Labels kept - they are
 *  good copy - tones mapped onto the single Pill vocabulary. */
export function employerProposalPill(status: string | null): { label: string; tone: Tone } {
  switch ((status ?? "").toLowerCase()) {
    case "sent":
      return { label: "Under review", tone: "waiting" };
    case "accepted":
      return { label: "Accepted · ready to hire", tone: "paid" };
    case "hired":
      return { label: "Hired & active", tone: "live" };
    case "rejected":
      return { label: "Declined by candidate", tone: "closed" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "neutral" };
    default:
      return { label: humanizeStatus(status ?? ""), tone: "neutral" };
  }
}

/** Generic fallback for any other stored enum (projects, orders, alerts). */
export function genericPill(status: string | null): { label: string; tone: Tone } {
  const key = (status ?? "").toLowerCase();
  if (["active", "live", "accepted", "hired", "completed", "approved", "paid"].includes(key))
    return { label: humanizeStatus(status ?? ""), tone: "live" };
  if (["pending", "scheduled", "submitted", "processing", "draft", "interview_scheduled"].includes(key))
    return { label: humanizeStatus(status ?? ""), tone: "waiting" };
  if (["rejected", "expired", "failed", "missed"].includes(key))
    return { label: humanizeStatus(status ?? ""), tone: "closed" };
  return { label: humanizeStatus(status ?? ""), tone: "neutral" };
}
