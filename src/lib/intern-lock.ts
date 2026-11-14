/**
 * The intern payment lock, as pure rules (no database, no Next imports), so the
 * decision is tested on its own and the proxy, the layout, the routes and the
 * nav all read the same answer.
 *
 * Until an intern has paid, only Home/Onboarding, Documents, Your profile,
 * Settings and Notifications (plus what the pay flow itself needs) are open.
 * Everything else is locked, on the server. "Paid" and "grandfathered" are
 * both "unlocked": see `unlockReason`.
 *
 * Before the profile is complete the set shrinks further (`precompleteVerdict`):
 * Documents and Your profile close and send the intern to onboarding.
 */

/** What the database says about one intern (internUnlockFacts in intern-unlock.ts). */
export type UnlockFacts = {
  /** A paid intern_payments row: gateway, promo, TPO code, drive code, admin "mark paid". */
  paidRow: boolean;
  /** Legacy `extra_data.payment.isPaid` (boolean true or the string "true"). */
  legacyPaid: boolean;
  /** Any proposal (offer, accepted or hired) from a company. Someone with one is already working or about to. */
  hasProposal: boolean;
  /** An interview with a real company (the AI interview does not count). */
  hasCompanyInterview: boolean;
};

export type UnlockReason = "paid" | "grandfathered";

/** Why this intern is unlocked, or null when the lock applies. */
export function unlockReason(f: UnlockFacts): UnlockReason | null {
  if (f.paidRow || f.legacyPaid) return "paid";
  // Existing interns who never paid but already have an offer, an interview or a job keep what they had.
  if (f.hasProposal || f.hasCompanyInterview) return "grandfathered";
  return null;
}

/** "unknown" = the lookup failed. Callers choose how to fail (see `lockVerdict`). */
export type UnlockState = "unlocked" | "locked" | "unknown";

/** Kill switch. On unless INTERN_PAYMENT_LOCK is off/0/false/disabled. Read per call so a restart is the only step. */
export function lockEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.INTERN_PAYMENT_LOCK ?? "").trim().toLowerCase();
  return !["off", "0", "false", "disabled", "no"].includes(v);
}

/**
 * The path as the router will see it: query/hash dropped, percent-escapes and
 * backslashes undone, `//`, `.` and `..` resolved, trailing slash gone, lower-case.
 * null when it can't be read safely (bad escape, a NUL byte): callers treat that as locked.
 */
export function normalizePath(raw: string): string | null {
  let p = raw.split("#")[0].split("?")[0];
  // Decode until stable (a double-encoded `%252e%252e` must not survive), at most a few rounds.
  for (let i = 0; i < 4; i++) {
    let next: string;
    try {
      next = decodeURIComponent(p);
    } catch {
      return null;
    }
    if (next === p) break;
    p = next;
  }
  if (p.includes("\0")) return null;
  p = p.replace(/\\/g, "/");
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg.trim());
  }
  return "/" + out.join("/").toLowerCase();
}

/** Pages an unpaid intern may open. Each also opens its sub-paths. */
export const OPEN_INTERN_PAGES = [
  "/intern/dashboard", // Home
  "/intern/onboarding", // Onboarding
  "/intern/documents",
  "/intern/profile", // Your profile
  "/intern/settings",
  "/intern/notifications",
  "/intern/guarantee", // linked from the pay card ("How the 6-month guarantee works")
  "/intern/college", // redirects to Settings
  "/intern/bank-details", // redirects to Settings
  "/intern/locked", // the explanation itself
] as const;

/**
 * Pages open to a locked intern whose profile is NOT complete yet: Home, the
 * onboarding form, Settings, Notifications and the explanation page. Each also
 * opens its sub-paths. `/intern/college` and `/intern/bank-details` only
 * redirect to Settings, so they stay reachable. Documents, Your profile and the
 * guarantee page are closed here and send the intern to onboarding.
 */
export const PRECOMPLETE_OPEN_PAGES = [
  "/intern/dashboard",
  "/intern/onboarding", // must stay reachable always: it is where the redirect lands
  "/intern/settings",
  "/intern/notifications",
  "/intern/locked",
  "/intern/college", // redirects to Settings
  "/intern/bank-details", // redirects to Settings
] as const;

export type PrecompleteVerdict = "allow" | "redirect_onboarding";

/**
 * The pre-completion rule, for a signed-in intern. `locked` = unpaid and not
 * grandfathered (the payment lock applies); `complete` = the profile checklist
 * is done, or null when it could not be read. Only a locked intern with a
 * profile known to be incomplete is restricted: paid and grandfathered interns
 * are never affected, and an unreadable checklist fails OPEN (never shut
 * someone out of onboarding). Onboarding itself is always allowed, so the
 * redirect cannot loop. Pages the payment lock already closes are not this
 * function's business: callers apply the payment lock first.
 */
export function precompleteVerdict(input: { pathname: string; complete: boolean | null; locked: boolean }): PrecompleteVerdict {
  if (!input.locked || input.complete !== false) return "allow";
  const p = normalizePath(input.pathname);
  if (!p) return "redirect_onboarding";
  if (p === "/intern") return "allow";
  return PRECOMPLETE_OPEN_PAGES.some((open) => p === open || p.startsWith(`${open}/`)) ? "allow" : "redirect_onboarding";
}

/** The pages whose nav entries stay open (lowercase hrefs from the intern layout). */
export function isOpenInternPage(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (!p) return false;
  if (p === "/intern") return true;
  return OPEN_INTERN_PAGES.some((open) => p === open || p.startsWith(`${open}/`));
}

/** True for any /intern page (the proxy's own definition, normalized). */
export function isInternPage(pathname: string): boolean {
  const p = normalizePath(pathname);
  return p === "/intern" || (p?.startsWith("/intern/") ?? false);
}

/**
 * API prefixes an unpaid intern is refused. These are the calls the locked pages
 * make (offers, interviews, timesheets, messages, payouts). The open
 * pages and the pay flow call none of them. Matched on the normalized path,
 * so case and trailing slashes don't matter; stricter than the router on purpose.
 */
const LOCKED_API = [
  /^\/api\/proposals(\/|$)/, // offer answer, offer letter
  /^\/api\/interviews(\/|$)/, // pick a slot
  /^\/api\/timesheets(\/|$)/,
  /^\/api\/threads(\/|$)/, // messages
  /^\/api\/intern\/timesheets(\/|$)/,
  /^\/api\/intern\/[^/]+\/payouts(\/|$)/, // stipend
] as const;

export function isLockedApi(pathname: string): boolean {
  const p = normalizePath(pathname);
  // Unreadable path on /api: locked is the safe side for an intern session.
  if (!p) return true;
  return LOCKED_API.some((re) => re.test(p));
}

export type LockVerdict =
  /** Let it through. */
  | "allow"
  /** Page: send to /intern/locked. */
  | "redirect_locked"
  /** API: 403 intern_locked. */
  | "deny_locked"
  /** API: could not verify (database down): 503, never open. */
  | "deny_unverified";

/** Whether the verdict can need a lookup at all (open pages and unlocked APIs never hit the database). */
export function needsLookup(input: { pathname: string; isApi: boolean; enabled: boolean }): boolean {
  if (!input.enabled) return false;
  return input.isApi ? isLockedApi(input.pathname) : !isOpenInternPage(input.pathname);
}

/**
 * The one decision, for an intern session. Pages fail OPEN when the lookup
 * failed (the page then fails on its own data reads, so nothing opens that a
 * database outage wouldn't already break, and a paid intern is never shown a
 * pay wall by a blip). APIs fail CLOSED: money and data writes never wait on a guess.
 */
export function lockVerdict(input: { pathname: string; isApi: boolean; enabled: boolean; state: UnlockState }): LockVerdict {
  if (!needsLookup(input)) return "allow";
  if (input.state === "unlocked") return "allow";
  if (input.isApi) return input.state === "locked" ? "deny_locked" : "deny_unverified";
  return input.state === "locked" ? "redirect_locked" : "allow";
}

/** Names for the locked page, keyed by normalized page prefix. Unknown pages just read "This page". */
const PAGE_NAMES: [string, string][] = [
  ["/intern/proposals", "Offers"],
  ["/intern/messages", "Messages"],
  ["/intern/interviews", "Interviews"],
  ["/intern/record", "Record"],
  ["/intern/timesheets", "Timesheets"],
  ["/intern/earnings", "Stipend"],
];

export function lockedPageName(from: string | null | undefined): string | null {
  const p = from ? normalizePath(from) : null;
  if (!p) return null;
  return PAGE_NAMES.find(([prefix]) => p === prefix || p.startsWith(`${prefix}/`))?.[1] ?? null;
}

/** Where a locked page sends the intern. `from` only picks a label; it is never followed. */
export function lockedHref(from?: string): string {
  const name = from && lockedPageName(from) ? `?from=${encodeURIComponent(normalizePath(from) ?? "")}` : "";
  return `/intern/locked${name}`;
}

/** Nav: which hrefs show a lock for this intern. */
export function isNavLocked(href: string, unlocked: boolean): boolean {
  return !unlocked && !isOpenInternPage(href);
}

export const LOCK_TEXT = "Unlocks after payment";
/** The nav's lock note for Documents and Your profile before the profile is complete. */
export const PRECOMPLETE_LOCK_TEXT = "Complete your profile first";
