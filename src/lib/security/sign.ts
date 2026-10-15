import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * HMAC-signed tokens and URLs.
 *
 * ── Why this exists ───────────────────────────────────────────────────
 *
 * The legacy server mounts the entire uploads directory on a public static
 * path (server/index.ts:104) with no authorisation check. That directory holds
 * 149 files, of which the onboarding upload route writes Aadhaar and PAN
 * images. Anyone who can guess or enumerate a filename can read an intern's
 * government identity document.
 *
 * The reason it was never caught is structural, not accidental:
 * `intern_document` (shared/schema.ts:765) records only `*_name`, `*_type`
 * and `*_size` for each upload. There is no column linking a user to a file.
 * Nothing in the system can express "this document belongs to this intern", so
 * nothing could enforce it.
 *
 * The fix therefore has two halves: opaque keys that carry no information, and
 * a signature that binds a key to a subject and an expiry. Guessing becomes
 * impossible because the key has no structure to guess, and a leaked URL stops
 * working on its own.
 *
 * ── Threat model ──────────────────────────────────────────────────────
 *
 * Protects: unauthenticated access, enumeration, and a URL that outlives its
 * authorisation. Does NOT protect: a logged-in user who is themselves the
 * subject, or an attacker who has already compromised the server. Those need
 * the authorisation check in the redeem route, not a longer token.
 */

/** A key is `<subject>.<random>`; it leaks nothing about the filename. */
export type OpaqueKey = string;

export function generateKey(subject: string): OpaqueKey {
  const safe = subject.replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "x";
  return `${safe}.${randomBytes(18).toString("base64url")}`;
}

export type SignedPayload = {
  /** The opaque key this token grants access to. */
  k: string;
  /** Who the file belongs to. Checked against the session on redeem. */
  s: string;
  /** What kind of document, so the client can label it. */
  d: string;
  /** Issued-at, epoch seconds. */
  i: number;
  /** Expiry, epoch seconds. */
  e: number;
  /** Single-use nonce. */
  n: string;
};

export type TokenFailure =
  | "malformed"
  | "bad-signature"
  | "expired"
  | "not-yet-valid"
  | "replayed";

export class TokenError extends Error {
  // Declared as a field rather than a constructor parameter property, so the
  // file survives Node's strip-only TypeScript mode as well as the bundler.
  readonly reason: TokenFailure;

  constructor(message: string, reason: TokenFailure) {
    super(message);
    this.name = "TokenError";
    this.reason = reason;
  }
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function secret(): string {
  const s = process.env.SIGNING_SECRET;
  if (!s || s.length < 32) {
    // A build that boots without a signing secret must not silently fall back
    // to a constant - that is the "Using unsafe secret" failure every auth
    // library warns about, and it would make every issued token forgeable.
    throw new Error(
      "SIGNING_SECRET is not set. It must be at least 32 characters of entropy.",
    );
  }
  return s;
}

function mac(data: string): Buffer {
  return createHmac("sha256", secret()).update(data).digest();
}

/**
 * Issue a signed token.
 *
 * @param ttl seconds, used to derive `e` unless the caller pins it. Keep this
 *   short. An upload URL is handed to a browser that is about to show the file;
 *   minutes is the right order of magnitude, not hours.
 */
export function sign(
  payload: { k: string; s: string; d: string; e?: number },
  ttl = 300,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SignedPayload = {
    k: payload.k,
    s: payload.s,
    d: payload.d,
    i: now,
    // Derived here rather than trusted from the caller, so a forgotten ttl can
    // never produce a token with no expiry.
    e: payload.e ?? now + ttl,
    n: randomBytes(9).toString("base64url"),
  };
  const body = b64url(JSON.stringify(full));
  return `${body}.${b64url(mac(body))}`;
}

/**
 * Verify a token and return its payload.
 *
 * Fails closed on every path: malformed, tampered, expired, or issued in the
 * future. The signature is checked in constant time, and the JSON is only
 * parsed after the signature verifies, so a forged token is never deserialised.
 */
export function verify(token: string, now = Date.now()): SignedPayload {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) throw new TokenError("Malformed token", "malformed");

  const body = token.slice(0, dot);
  const sig = fromB64url(token.slice(dot + 1));
  const expected = mac(body);

  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    throw new TokenError("Signature mismatch", "bad-signature");
  }

  let payload: SignedPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    throw new TokenError("Undecodable payload", "malformed");
  }

  const nowSec = Math.floor(now / 1000);
  if (typeof payload.e !== "number" || payload.e <= nowSec) {
    throw new TokenError("Token expired", "expired");
  }
  if (typeof payload.i !== "number" || payload.i > nowSec + 60) {
    throw new TokenError("Token not yet valid", "not-yet-valid");
  }

  return payload;
}

/** Build the redeemable URL. */
export function signedUrl(
  path: string,
  payload: { k: string; s: string; d: string; e?: number },
  ttl = 300,
): string {
  const base = process.env.PUBLIC_ORIGIN ?? "http://localhost:3100";
  return `${base.replace(/\/$/, "")}${path}?t=${sign(payload, ttl)}`;
}

/**
 * Replay guard.
 *
 * `n` makes each token unique, which is what stops a URL that has been
 * legitimately fetched once from being reusable. In-memory is enough for a
 * single process; a multi-instance deployment swaps the implementation for a
 * Redis SETEX without touching the callers.
 */
export class ReplayGuard {
  private seen = new Map<string, number>();
  private readonly max: number;

  constructor(max = 10_000) {
    this.max = max;
  }

  /** @returns true if this is the first time the nonce has been presented. */
  check(nonce: string, now = Date.now()): boolean {
    for (const [k, exp] of this.seen) {
      if (exp < now) this.seen.delete(k);
    }
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, now + 5 * 60_000);
    if (this.seen.size > this.max) {
      const oldest = this.seen.keys().next().value;
      if (oldest) this.seen.delete(oldest);
    }
    return true;
  }
}

export const replayGuard = new ReplayGuard();
