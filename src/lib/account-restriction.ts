/**
 * The one rule for a FROZEN account (see lib/moderation/strikes.ts): it can sign in, but every page and API except a small
 * allowlist is refused (pages redirect to /account-on-hold, APIs answer 403 ACCOUNT_ON_HOLD). Pure and import-free so the whole
 * matrix runs under plain `node --test`; the server wires it in lib/auth.ts (getSessionState), which every layout, page and route
 * reads through, so there is no per-route list to forget.
 *
 * Allowlist for any frozen account: the on-hold page, sign-out, static assets. (The contact-admin mailto is a link, not a request.)
 * The strike "acknowledge" endpoint is not on it: a frozen account has nothing to acknowledge, and a pending warning shows again
 * if the account is released.
 *
 * Extra for a frozen INTERN an admin let keep working (`workExempt`, and only while a paid hire is still running; the caller
 * answers that): their timesheets, stipend view and notifications, nothing else. Not offers, browsing, uploads or profile edits.
 */

export type Verdict = "allow" | "hold";

export const ON_HOLD_PAGE = "/account-on-hold";

const STATIC = /^\/(_next\/|favicon\.ico$|robots\.txt$|sitemap\.xml$)|\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|map|woff2?|ttf|txt|xml)$/i;
/** A file extension never makes an app page or API static (a dynamic segment like /intern/proposals/x.png is still a page). */
const APP_AREA = /^\/(api|intern|employer|admin|college)(\/|$)/;
const HELD_PAGES = [ON_HOLD_PAGE];
const HELD_API = ["/api/auth/logout"];

const WORK_PAGES = ["/intern/timesheets", "/intern/earnings", "/intern/notifications"];
const WORK_API = ["/api/intern/timesheets", "/api/notifications/read-all"];
/** /api/intern/<id>/payouts (the stipend view) and /api/notifications/<id>/read. */
const WORK_API_PATTERNS = [/^\/api\/intern\/[^/]+\/payouts$/, /^\/api\/notifications\/[^/]+\/read$/];

/** The path without query, hash or a trailing slash; null when it is not an absolute path or tries to climb out. */
export function cleanPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return path.split("/").includes("..") || path.includes("\\") || /%(2e|2f|5c|00)/i.test(path) ? null : path;
}

const under = (path: string, bases: readonly string[]) => bases.some((b) => path === b || path.startsWith(`${b}/`));

export function isStaticAsset(path: string): boolean {
  return STATIC.test(path) && !APP_AREA.test(path);
}

/** Allowed for every frozen account. */
export function isHeldAllowlisted(raw: string | null | undefined): boolean {
  const path = cleanPath(raw);
  return path !== null && (isStaticAsset(path) || under(path, HELD_PAGES) || under(path, HELD_API));
}

/** Allowed additionally for a frozen intern with a work exemption. */
export function isWorkSurface(raw: string | null | undefined): boolean {
  const path = cleanPath(raw);
  return path !== null && (under(path, WORK_PAGES) || under(path, WORK_API) || WORK_API_PATTERNS.some((re) => re.test(path)));
}

export type RestrictionInput = {
  role: string;
  /** frozen_at is set. Warned and clean accounts are not restricted. */
  frozen: boolean;
  /** An admin let this intern keep working AND a paid hire is still running (already combined by the caller). */
  workExempt: boolean;
  /** The request path; null when unknown, which is never allowlisted (fail closed). */
  path: string | null | undefined;
};

export function restrictionVerdict(i: RestrictionInput): Verdict {
  if (!i.frozen) return "allow";
  if (isHeldAllowlisted(i.path)) return "allow";
  if (i.workExempt && i.role === "intern" && isWorkSurface(i.path)) return "allow";
  return "hold";
}

/** Where a person lands right after signing in: the on-hold page, or their timesheets when they were let keep working. */
export function landingAfterLogin(i: { role: "intern" | "employer"; frozen: boolean; workExempt: boolean }, normal: string): string {
  if (!i.frozen) return normal;
  return i.role === "intern" && i.workExempt ? "/intern/timesheets" : `${ON_HOLD_PAGE}?as=${i.role}`;
}
