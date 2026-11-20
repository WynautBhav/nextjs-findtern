/**
 * Emails for account standing: a warning, a freeze (account on hold) and an unfreeze. Same EmailContent shape and calm tone
 * as lib/emails.ts (rendered by renderEmail, sent by notify()). Plain text only: what happened in general terms, never a
 * score, a quote, the evidence note or the admin who acted. Templates never throw: a missing public origin only costs the button.
 */
import type { EmailContent } from "../emails.ts";
import { linkTo } from "../origin.ts";
import { ACCOUNT_ON_HOLD_CONTACT, ACCOUNT_ON_HOLD_MESSAGE } from "../account-hold.ts";
import { STRIKE_REASON_PUBLIC, type StrikeReason } from "../moderation/strikes.ts";

type Who = { name: string; role: "intern" | "employer"; reason: StrikeReason };

const hi = (name: string) => `Hi ${name || "there"},`;
const home = (role: Who["role"]) => (role === "employer" ? "/employer/dashboard" : "/intern/dashboard");

function cta(label: string, path: string): EmailContent["cta"] {
  const url = linkTo(path);
  return url === null ? undefined : { label, url };
}

const what = (reason: StrikeReason) => STRIKE_REASON_PUBLIC[reason] ?? STRIKE_REASON_PUBLIC.other;

export const standingEmails = {
  accountWarning: (o: Who): EmailContent => ({
    subject: "A notice about your Findtern account",
    preheader: "Please read and acknowledge this notice the next time you sign in.",
    heading: "A notice about your account",
    greeting: hi(o.name),
    lines: [
      `Findtern reviewed activity on your account and found ${what(o.reason)}, which does not follow our terms of use.`,
      "This is a warning. Nothing has been removed and your account stays active. The next time you sign in you will see this notice and need to acknowledge it before you continue.",
      "If it happens again, your account will be put on hold. Your data would be kept, and Findtern admin can restore access after you get in touch.",
      `If you think this is a mistake, write to ${ACCOUNT_ON_HOLD_CONTACT}.`,
    ],
    status: "Acknowledge in the app",
    tone: "wait",
    cta: cta("Open Findtern", home(o.role)),
  }),

  accountFrozen: (o: Who): EmailContent => ({
    subject: "Your Findtern account is on hold",
    preheader: "Please contact Findtern admin to restore access.",
    heading: "Your account is on hold",
    greeting: hi(o.name),
    lines: [
      `Findtern reviewed activity on your account and found ${what(o.reason)}, which does not follow our terms of use. ${ACCOUNT_ON_HOLD_MESSAGE}`,
      `You can still sign in to see the status, but nothing else is available until access is restored. Write to ${ACCOUNT_ON_HOLD_CONTACT} from the email on your account. This is also how you appeal.`,
      "What stays safe: your profile, documents and records are kept, and nothing has been deleted. Payments and timesheets for work already under way are not cancelled. Offers and proposals in progress are paused, and carry on if access is restored.",
    ],
    status: "On hold",
    tone: "alert",
    cta: { label: "Contact Findtern admin", url: `mailto:${ACCOUNT_ON_HOLD_CONTACT}` },
  }),

  /** Internal alert to the Findtern team: a frozen intern still has a paid internship running. Names, company and a link only: no reason, no evidence. */
  adminFrozenHire: (o: { internName: string; internId: string; company: string }): EmailContent => ({
    subject: "Frozen intern has a running internship: decide",
    preheader: `${o.internName || "An intern"} is frozen and has a running internship with ${o.company}.`,
    heading: "A frozen intern has a running internship",
    greeting: "Hi team,",
    lines: [
      `${o.internName || "An intern"} is on hold and has a running internship with ${o.company}. Their hire and payments carry on as they are.`,
      "Please decide: let them keep working (timesheets, stipend view and notifications only), or keep them fully frozen. Until you decide, they stay fully frozen.",
    ],
    status: "Needs a decision",
    tone: "wait",
    cta: cta("Open the intern", `/admin/interns/${o.internId}`),
  }),

  accountUnfrozen: (o: Omit<Who, "reason">): EmailContent => ({
    subject: "Your Findtern account is active again",
    preheader: "Your access has been restored.",
    heading: "Your access is restored",
    greeting: hi(o.name),
    lines: [
      "Thank you for getting in touch. Your Findtern account is active again and you can sign in as usual.",
      "Offers and proposals that were paused carry on, unless they ran out while the account was on hold.",
      "Please keep to the terms of use from here on. A further confirmed breach will put the account on hold again.",
    ],
    status: "Restored",
    tone: "done",
    cta: cta("Sign in", home(o.role)),
  }),
};

/** In-app copy beside each email. */
export const standingNotices = {
  warning: { title: "A notice about your account", message: "Please read and acknowledge the notice about your account. A second confirmed breach puts the account on hold." },
  frozen: { title: "Your account is on hold", message: `${ACCOUNT_ON_HOLD_MESSAGE} Write to ${ACCOUNT_ON_HOLD_CONTACT}.` },
  unfrozen: { title: "Your access is restored", message: "Your account is active again. Paused offers and proposals continue unless they ran out." },
} as const;
