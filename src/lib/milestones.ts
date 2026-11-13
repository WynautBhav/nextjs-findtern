import { formatMoney, shortDate } from "./format.ts";
import { companyIn, hoursIn, isAcceptedStatus, periodLabel, roleOf, type PayoutRow, type ProposalRow, type TimesheetRow } from "./journey.ts";
import { isHiredProposal } from "./hire-status.ts";

export { currentMilestone } from "./milestone-pick.ts";

/**
 * The inline script that runs right after the server-rendered notes, before first paint: it keeps only the first note
 * whose id is not in the browser's dismissed list (a JSON array in localStorage under `storageKey`, written by the
 * client note) and hides the rest. The result is embedded in a <script>, so it must stay free of "<" (the caller
 * escapes it, which would break the code); the test runs it against a fake page.
 */
export function noteGuardScript(storageKey: string, label: string): string {
  return (
    `try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})||"[]");if(!Array.isArray(d))d=[];` +
    `var s=document.querySelectorAll('section[data-note-for="'+${JSON.stringify(label)}+'"]'),f=0;` +
    `for(var i=0;s.length>i;i++){if(!f&&d.indexOf(s[i].getAttribute("data-note-id"))===-1){f=1;s[i].classList.remove("hidden")}` +
    `else s[i].style.display="none"}}catch(_){}`
  );
}

/**
 * Milestone notes.
 *
 * For a week after a real event the intern sees one quiet, dated note: the stored fact and the next step. It is a
 * statement of what happened, not a reward. Nothing counts days, nothing is lost by not opening the app, and a
 * note that was dismissed never comes back.
 *
 * Only events that carry a stored timestamp qualify (the proof cards follow the same rule, see journey.ts):
 *   - profile submitted   intern_onboarding.extra_data.profileSubmittedAt (written once, on the final submit)
 *   - score published     extra_data.approvedAt (written by the automatic approval of a live score)
 *   - first offer         proposals.created_at of the earliest offer that is open or accepted
 *   - first approved hrs  timesheets.approved_at (earliest)
 *   - first payout        intern_payouts.paid_at (earliest paid stipend)
 * "Profile complete" has no stored completion time (completeness is computed on read), so the submit time stands
 * in for it; a legacy profile with no profileSubmittedAt gets no profile note. A score set by staff without
 * approvedAt gets no score note.
 *
 * Money: only the intern's own paid stipend, on the intern side. The activation payment lives in intern_payments,
 * which nothing here reads, and a payout of any kind other than "stipend" is ignored.
 */

/** How long a note stays up after its event. */
export const MILESTONE_DAYS = 7;
const DAY = 86_400_000;

export type MilestoneKind = "payout" | "hours" | "offer" | "score" | "profile";

/** Highest first. The most advanced step of the journey leads; the rest wait their turn (or never show). */
export const MILESTONE_PRIORITY: readonly MilestoneKind[] = ["payout", "hours", "offer", "score", "profile"];

export type MilestoneEvents = {
  profileSubmittedAt?: Date | null;
  score?: { at: Date | null; overall: number } | null;
  firstOffer?: { at: Date; proposalId: string; company: string; role: string; stage: "open" | "accepted" | "hired" } | null;
  firstApprovedHours?: { at: Date; timesheetId: string; hours: number; period: string } | null;
  firstPayout?: { at: Date; payoutId: string; amountMinor: number; currency: string } | null;
};

export type Milestone = {
  /** Stable, so a dismissal survives reloads. Includes the row id where one event can recur. */
  id: string;
  kind: MilestoneKind;
  at: Date;
  /** The stored fact and its date, as one sentence. */
  fact: string;
  next: { label: string; href: string };
};

const day = (at: Date) => shortDate(at, { day: "numeric", month: "short", year: "numeric" });

/** Every milestone still inside its week, in priority order. */
export function milestonesFor(events: MilestoneEvents, now: Date): Milestone[] {
  const all: Milestone[] = [];

  const p = events.firstPayout;
  if (p) {
    all.push({
      id: `payout:${p.payoutId}`,
      kind: "payout",
      at: p.at,
      fact: `A stipend payment of ${formatMoney(p.amountMinor, p.currency, { zeroLabel: false })} reached your account on ${day(p.at)}.`,
      next: { label: "See it on Stipend", href: "/intern/earnings" },
    });
  }

  const h = events.firstApprovedHours;
  if (h) {
    all.push({
      id: `hours:${h.timesheetId}`,
      kind: "hours",
      at: h.at,
      fact: `${h.hours} hours for ${h.period} were approved on ${day(h.at)}.`,
      next: { label: "Open Timesheets", href: "/intern/timesheets" },
    });
  }

  const o = events.firstOffer;
  if (o) {
    all.push({
      id: `offer:${o.proposalId}`,
      kind: "offer",
      at: o.at,
      fact: `Your first offer, for ${o.role} at ${o.company}, arrived on ${day(o.at)}.`,
      next:
        o.stage === "hired"
          ? { label: "Open Timesheets", href: "/intern/timesheets" }
          : { label: o.stage === "open" ? "Read the offer" : "Open the offer", href: `/intern/proposals/${o.proposalId}` },
    });
  }

  const s = events.score;
  if (s?.at) {
    all.push({
      id: "score",
      kind: "score",
      at: s.at,
      fact: `Your Findtern Score of ${s.overall.toFixed(1)}/10 was published on ${day(s.at)}.`,
      next: { label: "See how it is made", href: "/intern/record" },
    });
  }

  if (events.profileSubmittedAt) {
    all.push({
      id: "profile",
      kind: "profile",
      at: events.profileSubmittedAt,
      fact: `You submitted your profile on ${day(events.profileSubmittedAt)}.`,
      next: { label: "See your profile as employers do", href: "/intern/profile" },
    });
  }

  return all
    .filter((m) => {
      const age = now.getTime() - m.at.getTime();
      return Number.isFinite(age) && age >= 0 && age < MILESTONE_DAYS * DAY;
    })
    .sort((a, b) => MILESTONE_PRIORITY.indexOf(a.kind) - MILESTONE_PRIORITY.indexOf(b.kind));
}

/* ── From the rows the intern already owns ─────────────────────────────── */

export type MilestoneSource = {
  proposals: ProposalRow[];
  timesheets: TimesheetRow[];
  payouts: PayoutRow[];
  /** `intern_onboarding.extra_data`, as stored. */
  extra: Record<string, unknown> | null | undefined;
  /** Company names as the intern may see them (hidden ones are already masked). */
  names: Record<string, string>;
  /** The current score, as `currentScore` in intern-data.ts reads it. */
  score: { overall: number; at: Date | null } | null;
};

const earliest = <T>(rows: T[], at: (r: T) => Date | null): T | null =>
  rows.filter((r) => at(r)).sort((a, b) => at(a)!.getTime() - at(b)!.getTime())[0] ?? null;

const validDate = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function milestoneEvents(src: MilestoneSource): MilestoneEvents {
  // An offer that exists for the intern: open, or said yes to. Closed, expired, withdrawn and
  // interview-stage rows are not offers (or have nothing left to do).
  const offers = src.proposals.filter((p) => p.status === "sent" || p.hiredAt || isAcceptedStatus(p.status));
  const offer = earliest(offers, (p) => p.createdAt);

  const approved = earliest(
    src.timesheets.filter((t) => t.approvedAt && t.status === "approved"),
    (t) => t.approvedAt,
  );

  // Stipends only: completion bonuses and anything else are not "your first payout".
  const paid = earliest(
    src.payouts.filter((r) => r.status === "paid" && (r.kind ?? "stipend") === "stipend" && r.paidAt),
    (r) => r.paidAt,
  );

  return {
    profileSubmittedAt: validDate(src.extra?.profileSubmittedAt),
    score: src.score ? { at: src.score.at, overall: src.score.overall } : null,
    firstOffer: offer
      ? {
          at: offer.createdAt,
          proposalId: offer.id,
          company: companyIn(src.names[offer.employerId]),
          role: roleOf(offer.offerDetails),
          stage: isHiredProposal(offer) ? "hired" : offer.status === "sent" ? "open" : "accepted",
        }
      : null,
    firstApprovedHours: approved
      ? { at: approved.approvedAt!, timesheetId: approved.id, hours: Number(hoursIn(approved).toFixed(1)), period: periodLabel(approved) }
      : null,
    firstPayout: paid ? { at: paid.paidAt!, payoutId: paid.id, amountMinor: Math.max(0, paid.amountMinor ?? 0), currency: paid.currency ?? "INR" } : null,
  };
}
