import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing.
 *
 * ── What was wrong ─────────────────────────────────────────────────────
 *
 * `bcrypt` is imported at server/routes.ts:19 in the legacy build and never
 * called. All three logins compare plaintext with `!==`:
 *
 *   intern   routes.ts:4260   user.password !== validatedData.password
 *   employer routes.ts:3950   employer.password !== validatedData.password
 *   admin    routes.ts:4300   adminRecord.password === currentPassword
 *
 * Every write path stores the raw string, so the database contains every
 * intern's, employer's and admin's actual password in the clear. Changing one
 * password also writes a plaintext copy, and the change-password paths compare
 * the current one in plaintext to authorise the change.
 *
 * ── Why argon2id ──────────────────────────────────────────────────────
 *
 * Argon2 won the Password Hashing Competition and is the current OWASP
 * first recommendation. `@node-rs/argon2` ships prebuilt binaries, so there is
 * no native compilation step in CI.
 *
 * A scrypt fallback is included for platforms where the prebuilt binary cannot
 * run. It is a genuine fallback, not a stub — scrypt is the second choice in
 * the same OWASP table, and a build that cannot install a native module is a
 * build that should not silently ship plaintext.
 */

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** OWASP's argon2id baseline: 19 MiB, t=2, p=1. */
const ARGON_OPTS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/** scrypt params chosen to match argon2id's ~19 MiB working set. */
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

let backend: "argon2" | "scrypt" = "argon2";

/**
 * Hash a password.
 *
 * @returns a self-describing string: `$argon2id$…`, `scrypt$N$r$p$salt$hash`,
 * or `plaintext$<salt>$hash` for the legacy upgrade path below.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new TypeError("password must be a non-empty string");
  }
  // Argon2 caps input at 2^32 bytes but hashing a multi-megabyte string is
  // a denial-of-service vector against our own CPU. 1 KiB is far above any
  // real password.
  if (plain.length > 1024) {
    throw new TypeError("password exceeds the 1 KiB maximum");
  }

  if (backend === "argon2") {
    try {
      return await argonHash(plain, ARGON_OPTS);
    } catch {
      // Fall through to scrypt rather than failing the login path.
      backend = "scrypt";
    }
  }

  const salt = randomBytes(16);
  const key = await scrypt(plain.normalize("NFKC"), salt, 32, SCRYPT_OPTS);
  return `scrypt$${SCRYPT_OPTS.N}$${SCRYPT_OPTS.r}$${SCRYPT_OPTS.p}$${salt.toString(
    "base64url",
  )}$${key.toString("base64url")}`;
}

/**
 * Verify a password against a stored hash.
 *
 * Handles four stored formats so the migration can be incremental and a
 * plaintext row never has to exist and a user never has to be locked out:
 *
 *   $argon2id$…          current
 *   scrypt$…             fallback
 *   plaintext$…          transitional shim, see `needsRehash`
 *   anything else        a raw string, compared in constant time
 *
 * The last case is the important one. It means the day this module is switched
 * on, every existing account still logs in — and `needsRehash` reports true
 * so the caller re-hashes it on the way through, upgrading the row in place.
 */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  if (!plain || !stored) return false;

  if (stored.startsWith("$argon2")) {
    try {
      return await argonVerify(stored, plain);
    } catch {
      return false;
    }
  }

  if (stored.startsWith("scrypt$")) {
    return verifyScrypt(plain, stored);
  }

  if (stored.startsWith("plaintext$")) {
    const [, , , salt, hash] = stored.split("$");
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, "base64url");
    const actual = await scrypt(
      plain.normalize("NFKC"),
      Buffer.from(salt, "base64url"),
      expected.length,
      SCRYPT_OPTS,
    );
    return safeEqual(actual, expected);
  }

  // A bare string: a legacy plaintext row. Compared with a constant-time
  // function so that guessing it character by character over the network
  // does not leak the value, which `===` would.
  return safeEqual(Buffer.from(plain, "utf8"), Buffer.from(stored, "utf8"));
}

async function verifyScrypt(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  const [, N, r, p, salt, hash] = parts;
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  try {
    const actual = await scrypt(
      plain.normalize("NFKC"),
      Buffer.from(salt, "base64url"),
      expected.length,
      { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT_OPTS.maxmem },
    );
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * True when a stored hash should be replaced on next successful login.
 *
 * The primary use is the plaintext upgrade: a row that matched as bare text is
 * hashed properly the moment that user signs in, so the database heals itself
 * one login at a time with no forced reset and no downtime.
 */
export function needsRehash(stored: string): boolean {
  if (!stored) return true;
  if (!stored.startsWith("$argon2")) return true;
  // Rehash if the parameters have been raised since this row was written.
  const m = /\$m=(\d+),t=(\d+),p=(\d+)/.exec(stored);
  if (!m) return true;
  return (
    Number(m[1]) < ARGON_OPTS.memoryCost ||
    Number(m[2]) < ARGON_OPTS.timeCost ||
    Number(m[3]) < ARGON_OPTS.parallelism
  );
}

/** Which hashing backend is live. Surfaced on the health endpoint. */
export function passwordBackend(): string {
  return backend;
}

/** Constant-time compare that tolerates length mismatch. */
function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    // Still burn a comparison so the timing does not reveal the length.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Password strength policy, ported from the legacy `isStrongPassword`
 * (routes.ts:27) so the rules do not change under users mid-migration.
 */
export function isStrongPassword(pw: string): boolean {
  if (typeof pw !== "string") return false;
  return (
    pw.length >= 8 &&
    pw.length <= 200 &&
    /[a-z]/.test(pw) &&
    /[A-Z]/.test(pw) &&
    /\d/.test(pw)
  );
}
