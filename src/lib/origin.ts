/**
 * Which deployment is this? Pure, no app imports, so both the SEO helpers and
 * the payment guard (and their tests) can use it.
 */

/** The hosts that serve the real site. Anything else is staging or a preview. */
const REAL_HOSTS = new Set(["findtern.in", "www.findtern.in"]);

/** The host of a PUBLIC_ORIGIN value, lower-cased, or "" when unset or not a URL. */
function hostOf(origin: string | undefined): string {
  const value = (origin ?? "").trim();
  if (!value) return "";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const DEV_ORIGIN = "http://localhost:3000";

/**
 * The origin to build absolute links from (emails, signed URLs, OAuth redirect
 * URIs). PUBLIC_ORIGIN when it is a valid http(s) origin; localhost only
 * outside production. In production a missing value throws: a reset-password
 * email that points at localhost is worse than one that fails and is noticed.
 */
export function requirePublicOrigin(env: Record<string, string | undefined> = process.env): string {
  const set = (env.PUBLIC_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[^/\s]+$/i.test(set)) return set;
  if (env.NODE_ENV === "production") throw new Error("PUBLIC_ORIGIN is not set: refusing to build a link to localhost");
  return DEV_ORIGIN;
}

/** True only when PUBLIC_ORIGIN names the real domain. Unset or unreadable is false. */
export function isRealDomain(origin: string | undefined = process.env.PUBLIC_ORIGIN): boolean {
  return REAL_HOSTS.has(hostOf(origin));
}

/**
 * True when PUBLIC_ORIGIN is set and is not the real domain (a Vercel preview or
 * the staging copy). An exact host match, so `findtern.in.evil.com` or
 * `staging.findtern.in` are not mistaken for the real site. Unset means a
 * local or legacy build and is not staging (robots and metadata treat it as
 * production); use `isRealDomain` where "unknown" must fail closed.
 */
export function isStagingOrigin(origin: string | undefined = process.env.PUBLIC_ORIGIN): boolean {
  return hostOf(origin) !== "" && !isRealDomain(origin);
}
