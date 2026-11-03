/**
 * The terms-acceptance pop-up: one version constant and the pure decisions
 * around it, so the layouts, the API and the tests all read the same rules.
 *
 * Version choice: the date of the owner's decision (4 Nov 2026: the site was
 * redesigned and the terms changed). It is deliberately NOT the `updated` date
 * of either legal document. Those dates are admin-editable CMS fields, so a
 * typo fix in the CMS would otherwise re-prompt every user. To ask everyone to
 * accept again later, change this constant.
 */
export const CURRENT_TERMS_VERSION = "2026-11-04";

/** The three console roles that can be asked. Admin staff are never prompted. */
export type TermsRole = "intern" | "employer" | "college";

/**
 * Show the pop-up when this account has not accepted the current version.
 * "View as" is read-only (the accept call would be refused), so an admin
 * looking at someone's console never sees, and cannot answer, their prompt.
 */
export function shouldShowTermsPrompt(input: {
  acceptedVersion: string | null | undefined;
  impersonating?: boolean;
}): boolean {
  if (input.impersonating) return false;
  return input.acceptedVersion !== CURRENT_TERMS_VERSION;
}

/** The terms page that applies to this role; opens in a new tab. */
export function termsHrefFor(role: TermsRole): string {
  return role === "employer" ? "/employer-terms-and-conditions" : role === "intern" ? "/intern-terms-and-conditions" : "/terms-and-conditions";
}

/** Which account table holds this role's acceptance. Keys of `schema`. */
export function acceptanceTableFor(role: TermsRole): "users" | "employers" | "collegeAdmins" {
  return role === "employer" ? "employers" : role === "college" ? "collegeAdmins" : "users";
}

/** Columns to write on acceptance. `at` is injected so tests are deterministic. */
export function acceptanceValues(at: Date = new Date()): { termsAcceptedVersion: string; termsAcceptedAt: Date } {
  return { termsAcceptedVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: at };
}
