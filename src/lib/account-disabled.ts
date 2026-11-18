import { SITE } from "./content/site.ts";

/**
 * One definition of "your account was switched off", shared by the server (login routes, session guards), the sign-in
 * page banner and the client watcher. Pure and import-light so client components can use it.
 */

/** Machine code on a 403 answer from any route refusing a deactivated account. A signed-out 401 uses SESSION_EXPIRED instead. */
export const ACCOUNT_DISABLED_CODE = "ACCOUNT_DISABLED";
export const SESSION_EXPIRED_CODE = "SESSION_EXPIRED";

/** `?reason=` value on the sign-in page after a session ended because the account was disabled. */
export const ACCOUNT_DISABLED_REASON = "disabled";

export const ACCOUNT_DISABLED_MESSAGE = `Your account has been disabled. Please contact admin at ${SITE.adminEmail}.`;

export type SignInRole = "intern" | "employer" | "college";

/** The role's sign-in page, flagged so it explains why the person landed there. */
export function disabledLoginHref(role: SignInRole): string {
  return `/login?as=${role}&reason=${ACCOUNT_DISABLED_REASON}`;
}

/** Body of a 403 refusing a disabled account. */
export function accountDisabledBody(): { error: string; code: typeof ACCOUNT_DISABLED_CODE } {
  return { error: ACCOUNT_DISABLED_MESSAGE, code: ACCOUNT_DISABLED_CODE };
}

/** Whether a parsed JSON response body carries the disabled code. */
export function isAccountDisabledBody(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { code?: unknown }).code === ACCOUNT_DISABLED_CODE;
}
