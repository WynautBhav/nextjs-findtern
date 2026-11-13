import { isPersonalEmail } from "./employer-onboarding.ts";

/**
 * Which addresses an intern may sign up with. Pure, so the signup form and the
 * server routes apply the same rule. A college that registered its own domain
 * (colleges.email_domains) is accepted by the server on top of this - see
 * `internEmailAllowed` in signup-otp.ts.
 */

/** Domain labels only: no spaces, no empty labels, no stray punctuation. */
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * True for a college mailbox by its domain's last labels: `.edu`, `.edu.<cc>`
 * or `.ac.<cc>` (mit.edu, srmist.edu.in, iitb.ac.in, x.edu.au). Matches whole
 * labels, never substrings, so academy.com, education.com and notedu.com do not.
 */
export function isAcademicEmail(email: string): boolean {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return false;
  const labels = value.slice(at + 1).split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return false;
  const last = labels[labels.length - 1];
  if (last === "edu") return true;
  const second = labels[labels.length - 2];
  return labels.length >= 3 && /^[a-z]{2}$/.test(last) && (second === "edu" || second === "ac");
}

/**
 * Interns register with a personal mailbox or a college one (so the college
 * can be verified later from the address). Work addresses stay refused.
 * googlemail.com is Gmail, which the Google sign-in accepts too.
 */
export function isInternEmail(email: string): boolean {
  return isPersonalEmail(email) || email.trim().toLowerCase().endsWith("@googlemail.com") || isAcademicEmail(email);
}

export const INTERN_EMAIL_MESSAGE =
  "Please use a personal email address (Gmail, Yahoo, Outlook and the like) or your college email address. Work addresses are not accepted.";
