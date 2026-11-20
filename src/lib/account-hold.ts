import { SITE } from "./content/site.ts";

/**
 * One definition of "your account is on hold" (an admin froze it; see lib/moderation/strikes.ts), shared by the server
 * (login routes, session guards), the on-hold page and the client watcher. Pure and import-light, like account-disabled.ts.
 * The contact address is the one every "contact admin" message already uses (SITE.adminEmail); nothing new is hard-coded.
 */

/** Machine code on a 403 answer from any route refusing a frozen account. */
export const ACCOUNT_ON_HOLD_CODE = "ACCOUNT_ON_HOLD";

/** The page a held account lands on, instead of a sign-in form. */
export const ACCOUNT_ON_HOLD_PATH = "/account-on-hold";

export const ACCOUNT_ON_HOLD_MESSAGE = "Your account is on hold. Please contact Findtern admin to restore access.";
export const ACCOUNT_ON_HOLD_CONTACT = SITE.adminEmail;

export type HoldRole = "intern" | "employer";

export function onHoldHref(role: HoldRole | "college"): string {
  return `${ACCOUNT_ON_HOLD_PATH}?as=${role === "employer" ? "employer" : "intern"}`;
}

/** Body of a 403 refusing a held account. */
export function accountOnHoldBody(): { error: string; code: typeof ACCOUNT_ON_HOLD_CODE } {
  return { error: `${ACCOUNT_ON_HOLD_MESSAGE} Write to ${ACCOUNT_ON_HOLD_CONTACT}.`, code: ACCOUNT_ON_HOLD_CODE };
}

export function isAccountOnHoldBody(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { code?: unknown }).code === ACCOUNT_ON_HOLD_CODE;
}

/** What the OTHER side of an offer or proposal sees while one party is on hold. Neutral: no reason, no name, nothing private. */
export const ON_HOLD_LABEL = "On hold";
export const ON_HOLD_OFFER_NOTE = "On hold. This can't move forward right now. It continues if it is released, or lapses after 14 days.";
export const ON_HOLD_REFUSAL = { error: "This is on hold right now, so it can't be changed. Please try again later.", code: "on_hold" } as const;
