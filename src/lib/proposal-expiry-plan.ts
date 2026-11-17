import { acceptedUnpaidExpired, type ExpiryInput } from "./proposal-expiry.ts";

/**
 * The pure half of the unpaid-offer sweeper (proposal-expiry-db.ts): which rows to expire, and what the two parties are
 * told. No database, so it is unit tested; the sweeper applies it under the employer's payment lock.
 */

/** Rows that should become `expired`: accepted, unpaid, start day begun, no open order (the same rule the pay gate uses). */
export function planExpiry<T extends ExpiryInput & { id: string }>(candidates: T[], openOrderIds: ReadonlySet<string>, now: Date = new Date()): T[] {
  return candidates.filter((c) => acceptedUnpaidExpired({ ...c, hasOpenOrder: openOrderIds.has(c.id) }, now));
}

export const expiryDedupeKey = (proposalId: string, who: "employer" | "intern") => `proposal_expired_unpaid:${proposalId}:${who}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}` : iso;
}

export type ExpiryNoticeInput = {
  proposalId: string;
  role: string;
  /** The candidate's initials: an employer sees no name before hire. */
  initials: string;
  company: string;
  startDate: string;
  /** Public origin for links, or null when unknown (then no email is sent). */
  site: string | null;
  /** The project is taken down: its employer is not nagged (the listing is view-only for them), the candidate is still told. */
  projectTakenDown: boolean;
};

type Notice = { title: string; message: string; data: Record<string, unknown> };

/** What each side is told. No pay figures, no candidate name on the employer side. */
export function expiryNotices(i: ExpiryNoticeInput): { employer: (Notice & { email?: import("./emails.ts").EmailContent }) | null; intern: Notice } {
  const when = dayLabel(i.startDate);
  const data = { proposalId: i.proposalId, reason: "unpaid_past_start", startDate: i.startDate };
  const employerMessage = `Your offer to ${i.initials} for ${i.role} expired: it was not paid before its start date, ${when}. Send a new proposal if you still want to hire.`;
  return {
    employer: i.projectTakenDown
      ? null
      : {
          title: "Offer expired before payment",
          message: employerMessage,
          data,
          email:
            i.site === null
              ? undefined
              : {
                  subject: `Your offer for ${i.role} expired before payment`,
                  heading: "Offer expired before payment",
                  greeting: "Hello,",
                  lines: [employerMessage, "Nothing was charged. A new proposal needs the candidate to accept again."],
                  status: "Expired",
                  tone: "wait",
                  cta: { label: "Open your proposals", url: `${i.site}/employer/proposals` },
                },
        },
    intern: {
      title: "An offer expired",
      message: `${i.company}'s offer for ${i.role} expired because it was not paid before its start date, ${when}. There is nothing you need to do.`,
      data,
    },
  };
}
