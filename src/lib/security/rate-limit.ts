import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Rate limiting and OTP generation.
 *
 * ── Rate limiting ─────────────────────────────────────────────────────
 *
 * The legacy server has none of it. `POST /api/auth/intern/login`
 * (routes.ts:4250), `/api/auth/employer/login` (routes.ts:3940) and
 * `/api/auth/admin/login` (routes.ts:4290) are three unauthenticated,
 * unthrottled password endpoints over a database that stores passwords in
 * plaintext. That combination is an offline-cracking table waiting to be
 * filled, and there is no lockout to slow it down.
 *
 * ── OTP ───────────────────────────────────────────────────────────────
 *
 * `Math.random().toString().slice(2, 8)` in routes.ts for the email OTP.
 * `Math.random` is a xorshift PRNG - given six consecutive outputs its
 * internal state is recoverable, so the OTP stream is predictable rather than
 * merely weak. Swapped for `randomInt` from `node:crypto`, a CSPRNG.
 *
 * `randomInt` (not `randomBytes`) is deliberate: it produces an unbiased
 * integer, so `randomInt(0, 1_000_000)` cannot skew toward low values the
 * way `n % 1_000_000` does when n is not a multiple of the bound.
 */

export type Bucket = {
  count: number;
  resetAt: number;
};

/**
 * Fixed-window counter, in memory.
 *
 * In-memory is a deliberate limitation, stated rather than hidden: it is
 * correct for a single process and wrong for a multi-instance deploy, where
 * each instance would keep its own count. The interface is the seam - swap the
 * two methods for Redis INCR/EXPIRE and no caller changes.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * @returns true when the request is allowed. Consumes one unit when it is.
   */
  take(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (b.count >= this.limit) return false;
    b.count += 1;
    return true;
  }

  /** Units left in the window, for a Retry-After header. */
  remaining(key: string, now = Date.now()): number {
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) return this.limit;
    return Math.max(0, this.limit - b.count);
  }

  retryAfterSeconds(key: string, now = Date.now()): number {
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) return 0;
    return Math.ceil((b.resetAt - now) / 1000);
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

/**
 * Named limiters.
 *
 * Login is tight because it fronts a plaintext-equivalent secret. Password
 * reset is separate so that hammering `forgot-password` cannot be used to
 * starve the login budget, or vice versa.
 */
export const limiters = {
  login: new RateLimiter(8, 15 * 60_000),
  otp: new RateLimiter(5, 15 * 60_000),
  otpVerify: new RateLimiter(10, 15 * 60_000),
  forgotPassword: new RateLimiter(3, 60 * 60_000),
  signup: new RateLimiter(5, 60 * 60_000),
  upload: new RateLimiter(20, 60 * 60_000),
  generic: new RateLimiter(60, 60_000),
  // Public form: tight like login, but its own bucket so it cannot eat logins.
  contact: new RateLimiter(8, 15 * 60_000),
  // Signup's "is this number taken?" pre-check. Unauthenticated, so it is
  // throttled to stop it being used to scan which numbers hold accounts.
  phoneLookup: new RateLimiter(10, 15 * 60_000),
};

/**
 * Bucket a request by IP and, when known, by identity.
 *
 * Keying on the identifier alone lets one attacker lock a known user out by
 * repeatedly failing their login - a denial-of-service, and often the reason a
 * limiter gets disabled. Keying on the IP alone lets a botnet spread an
 * attempt. Keying on both lets a single IP exhaust only its own budget for
 * that user.
 */
export function bucketKey(ip: string, identifier?: string): string {
  const id = identifier
    ? createHash("sha256").update(identifier.toLowerCase()).digest("base64url").slice(0, 16)
    : "-";
  return `${ip}:${id}`;
}

/** Client IP from proxy headers, first entry. */
export function clientIp(headers: {
  get(name: string): string | null;
}): string {
  // Forwarding headers are client-controlled unless a proxy we run rewrote
  // them. The first X-Forwarded-For entry is whatever the caller sent, so
  // trusting it let anyone rotate a fake IP and walk past every login, OTP and
  // reset limit. Only trust them behind a known proxy:
  //  - TRUST_PROXY=1: our nginx (deploy/nginx-findtern.conf) sets
  //    X-Forwarded-For to $remote_addr, so the right-most entry is the real
  //    peer even if a client pre-filled the header.
  //  - Vercel: the platform overwrites x-real-ip / x-forwarded-for.
  const trustProxy = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? "");
  if (trustProxy) {
    const fwd = headers.get("x-forwarded-for");
    const last = fwd?.split(",").map((s) => s.trim()).filter(Boolean).pop();
    return last || headers.get("x-real-ip") || "unknown";
  }
  if (process.env.VERCEL === "1") {
    return headers.get("x-real-ip") || headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  }
  // No trusted proxy configured: every caller shares one bucket rather than
  // choosing their own. Set TRUST_PROXY=1 in production behind nginx.
  return "unknown";
}

/**
 * A 6-digit OTP from a CSPRNG, zero-padded.
 *
 * @returns the digits, for sending. Store the hash, never this value.
 */
export function generateOtp(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}

/** Hash an OTP for storage. */
export function hashOtp(otp: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${otp}`).digest("base64url");
}

/** Constant-time OTP compare. */
export function verifyOtp(otp: string, salt: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(otp, salt));
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Generic purpose email token - password reset, email verification.
 *
 * 32 bytes of CSPRNG, base64url. Long-lived (1h) and single-use: the store
 * deletes it on redemption, which is enforced by the route, not here.
 */
export function generateEmailToken(): string {
  return randomBytes(32).toString("base64url");
}
