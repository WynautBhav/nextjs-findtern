/**
 * Staging helpers: the deployed Vercel site is backed by a Neon database, and
 * the staging journey needs to read it (assertions, the signup code) and, for
 * its OWN rows only, move dates into the past ("time travel").
 *
 * Safety rules, enforced here rather than trusted:
 *  - the database host must be a Neon host, and never the production server;
 *  - every write goes through `ownedWrite`, which refuses an id that this run
 *    did not create (the manifest);
 *  - nothing here reads or prints a connection string or a password.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import pg from "pg";

const TIMESTAMP_OID = 1114;
const types = {
  getTypeParser(oid, format) {
    if (oid === TIMESTAMP_OID) return (v) => (v === null ? null : new Date(`${v.replace(" ", "T")}Z`));
    return pg.types.getTypeParser(oid, format);
  },
};

/** Hosts this suite must never touch, whatever a file says. */
const FORBIDDEN_HOSTS = new Set(["147.93.27.44"]);

/** The staging database this suite is allowed to use; override only with STAGING_DB_HOST. */
const STAGING_DB_HOST = process.env.STAGING_DB_HOST || "ep-mute-unit-b5ooitso-pooler.c-7.us-east-2.aws.neon.tech";

/** The site under test. The real domain, or any findtern.in subdomain, is refused: this suite signs up, pays and writes. */
function stagingUrl() {
  const url = (process.env.STAGING_URL || "https://nextjs-findtern.vercel.app").replace(/\/$/, "");
  const host = new URL(url).hostname.toLowerCase().replace(/\.+$/, "");
  // An allow-list, not a deny-list: a Vercel deployment, this machine, or a host named in STAGING_ALLOW_HOSTS.
  // Anything else (the real domain, a subdomain, the production server's address) is refused.
  const extra = (process.env.STAGING_ALLOW_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const real = host === "findtern.in" || host.endsWith(".findtern.in") || FORBIDDEN_HOSTS.has(host);
  const allowed = host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app") || extra.includes(host);
  if (real || !allowed) {
    throw new Error(`Refusing to run against ${host}: this suite creates accounts, sends email and records payments, so it only runs against a *.vercel.app staging site, localhost, or a host listed in STAGING_ALLOW_HOSTS.`);
  }
  return url;
}
export const STAGING_URL = stagingUrl();

function stagingDatabaseUrl() {
  const file = process.env.NEON_ENV_FILE || join(homedir(), "findtern-dumps", ".neon.env");
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="));
  const url = line?.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  if (!url) throw new Error("No DATABASE_URL in the Neon env file");
  const host = new URL(url).hostname;
  if (FORBIDDEN_HOSTS.has(host)) throw new Error("Refusing to run: that is the production database host");
  // Exactly the staging project, not "any Neon host": if production ever moves to Neon this still refuses it.
  if (host !== STAGING_DB_HOST) throw new Error(`Refusing to run: "${host}" is not the staging database host`);
  return url;
}

/** Reads and writes use separate pools; the read pool cannot change anything even if handed an UPDATE. */
let readPool = null;
let writePool = null;
function reader() {
  if (!readPool) {
    readPool = new pg.Pool({ connectionString: stagingDatabaseUrl(), max: 3, options: "-c TimeZone=UTC -c default_transaction_read_only=on", types, ssl: { rejectUnauthorized: true } });
  }
  return readPool;
}
function writer() {
  if (!writePool) {
    writePool = new pg.Pool({ connectionString: stagingDatabaseUrl(), max: 1, options: "-c TimeZone=UTC", types, ssl: { rejectUnauthorized: true } });
  }
  return writePool;
}

export async function rows(sql, params = []) {
  return (await reader().query(sql, params)).rows;
}
export async function one(sql, params = []) {
  return (await rows(sql, params))[0] ?? null;
}
export async function closeDb() {
  if (readPool) await readPool.end();
  if (writePool) await writePool.end();
  readPool = null;
  writePool = null;
}

/* ── Manifest: the ids this run created ───────────────────────────────────── */

const owned = new Map(); // id -> label

export function own(label, id) {
  if (!id) throw new Error(`own(${label}): no id`);
  owned.set(id, label);
  return id;
}
export const manifest = () => Object.fromEntries(owned);

/**
 * The only way to write to staging. `ownerId` must be an id this run
 * created, and the statement must mention it as a parameter.
 */
export async function ownedWrite(ownerId, sql, params) {
  if (!owned.has(ownerId)) throw new Error(`Refusing to write: ${ownerId} was not created by this run`);
  if (!params.includes(ownerId)) throw new Error("Refusing to write: the statement does not filter on the owned id");
  if (!/^\s*update\s/i.test(sql)) throw new Error("ownedWrite only runs UPDATE statements");
  if (!/\bwhere\b/i.test(sql)) throw new Error("UPDATE without WHERE");
  // In a transaction: if the statement touches anything other than exactly one row, it is rolled back.
  const client = await writer().connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(sql, params);
    if (res.rowCount !== 1) {
      await client.query("ROLLBACK");
      throw new Error(`Expected to change 1 row, would have changed ${res.rowCount}; rolled back`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ── Signup code, read from the database ──────────────────────────────────── */

/**
 * The email code is stored as sha256("<email>:<code>") (signup-otp: hashOtp),
 * and the code is 6 digits, so the newest unused row for one of OUR test
 * addresses can be turned back into the code. The same code is also emailed to
 * the owner's inbox through the +ftqa alias.
 */
export async function readSignupCode(email, subjectType, sinceMs) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const row = await one(
      `SELECT otp_hash, created_at FROM email_otps
        WHERE subject_id = $1 AND subject_type = $2 AND used_at IS NULL AND created_at >= $3
        ORDER BY created_at DESC LIMIT 1`,
      // An ISO string, not a Date: pg would send a Date in this machine's local
      // time, and the column has no time zone.
      [email, subjectType, new Date(sinceMs - 2000).toISOString()],
    );
    if (row) {
      for (let n = 0; n < 1_000_000; n++) {
        const code = String(n).padStart(6, "0");
        if (createHash("sha256").update(`${email}:${code}`).digest("base64url") === row.otp_hash) return code;
      }
      throw new Error(`Could not recover the code for ${email}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No code row appeared for ${email} within 30 s`);
}
