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

/**
 * Candidate-facing proposal state. Takes the stored status or the derived
 * intern key from lib/intern-offer-view (`lapsed`, `fulltime_hired`), which
 * is what the intern offer screens pass.
 */
export function proposalStatus(status: string | null): {
  label: string;
  tone: Tone;
  detail: string;
} {
  switch ((status ?? "").toLowerCase()) {
    // "processing" is a legacy checkout in progress: the intern already
    // accepted (INW-21). Logging hours waits for the payment (bug sheet 7,
    // S1 r65 over r55).
    case "accepted":
    case "processing":
      return {
        label: "Accepted · awaiting payment",
        tone: "waiting",
        detail: "You accepted this offer. The company completes the payment next, and logging hours opens once they do.",
      };
    case "hired":
      return {
        label: "Hired",
        tone: "paid",
        detail: "The company completed the payment. Log your hours on Timesheets.",
      };
    // Accepting a full-time offer is the hire itself (INW-13): no payment
    // step on the intern's side and no timesheets.
    case "fulltime_hired":
      return {
        label: "Hired · full-time",
        tone: "paid",
        detail: "You accepted this full-time offer, which makes you hired. Join the company on the joining date.",
      };
    case "rejected":
      return { label: "Rejected", tone: "closed", detail: "This offer is closed. Nothing more is needed from you." };
    case "interview_scheduled":
      return {
        label: "Interview booked",
        tone: "waiting",
        detail: "Waiting on the interview to happen.",
      };
    case "withdrawn":
      return { label: "Withdrawn", tone: "closed", detail: "The company withdrew this offer." };
    // Legacy shows "expired" as Withdrawn (INW-16): it is set when another
    // offer from the same company was accepted, or by Findtern staff.
    case "expired":
      return {
        label: "Withdrawn",
        tone: "closed",
        detail: "This offer was closed, usually because you accepted another offer from the same company.",
      };
    // Not stored: an offer the intern never answered, once its joining date
    // arrived (INW-17: it closes on that date).
    case "lapsed":
      return {
        label: "Rejected · no response",
        tone: "closed",
        detail: "You did not answer before the joining date, so the offer closed on that date and was marked as rejected.",
      };
    case "draft":
      return { label: "Not sent yet", tone: "neutral", detail: "The company has not sent this." };
    default:
      return {
        label: "Waiting on you",
        tone: "waiting",
        detail: "Accept or turn it down before the joining date. If you do nothing, it closes on the joining date and is marked as rejected.",
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
