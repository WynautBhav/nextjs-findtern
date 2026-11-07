/**
 * Helpers for the college drive journey (e2e/drive-journey.e2e.mjs).
 * FAKE people only: every name, email and phone here is invented, and every
 * email ends in @e2e-drive.test (a reserved, non-routable test domain).
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hash } from "@node-rs/argon2";

import { E2E_DIR, baseUrl, testDatabaseUrl } from "./env.mjs";
import { rows } from "./db.mjs";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
/** Mirrors CURRENT_TERMS_VERSION in src/lib/terms.ts so the terms pop-up never blocks a login. */
export const TERMS_VERSION = process.env.E2E_TERMS_VERSION ?? "2026-11-06";
export const DOMAIN = "e2e-drive.test";

/**
 * Refuse to run unless BOTH the database and the server are on this machine.
 * Returns { base } and points lib/db.mjs at the same database.
 */
export function assertLocalOnly() {
  process.env.DATABASE_URL = testDatabaseUrl(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL); // throws on a non-loopback host
  const base = process.env.E2E_BASE ?? baseUrl();
  const host = new URL(base).hostname;
  if (!LOOPBACK.has(host)) throw new Error(`Refusing to run: E2E_BASE host "${host}" is not localhost/127.0.0.1/::1`);
  return { base };
}

/** A short tag so reruns never collide on the global unique users.email / phone. */
export const RUN = Date.now().toString(36);
let seq = 0;
const stamp = Date.now() % 1_000_000_000;
/** A fake Indian mobile (10 digits, starts with 9), unique within and across runs. */
export const fakePhone = () => `9${String((stamp + ++seq * 7919) % 1_000_000_000).padStart(9, "0")}`;
/** "+91 98765 43210" style, to exercise the importer's phone normalisation. */
export const spacedPhone = (p10) => `+91 ${p10.slice(0, 5)} ${p10.slice(5)}`;
export const e164 = (p10) => `+91${p10}`;
export const email = (label) => `${label}-${RUN}@${DOMAIN}`;
export const futureIso = (days = 30) => new Date(Date.now() + days * 86_400_000).toISOString();

/* ── roster files ─────────────────────────────────────────────────────────── */

const csvCell = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/**
 * Roster CSV bytes: UTF-8 BOM, header "Name,College Email,Mobile", quoted cells where needed.
 * rows = [{ name, email, phone }]. (XLSX is not generated: the repo has no spreadsheet writer
 * and a hand-rolled zip would test our zip code, not the importer.)
 */
export function rosterCsv(rowsIn, { bom = true } = {}) {
  const lines = ["Name,College Email,Mobile", ...rowsIn.map((r) => [r.name, r.email, r.phone ?? ""].map(csvCell).join(","))];
  return Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(lines.join("\r\n") + "\r\n", "utf8")]);
}

/** Multipart form for page.request.fetch({ multipart }). */
export const csvMultipart = (bytes, name = "roster.csv") => ({ file: { name, mimeType: "text/csv", buffer: bytes } });

/* ── drive codes (derived from the row id, never stored) ──────────────────── */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** The server's signing secret: E2E_SIGNING_SECRET, else the value e2e/run.mjs gives the server. */
export function signingSecret() {
  const fromEnv = process.env.E2E_SIGNING_SECRET ?? process.env.SIGNING_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  const m = /SIGNING_SECRET:\s*"([^"]{32,})"/.exec(readFileSync(join(E2E_DIR, "run.mjs"), "utf8"));
  if (!m) throw new Error("Set E2E_SIGNING_SECRET to the server's SIGNING_SECRET (>= 32 chars)");
  return m[1];
}

/** Same derivation as src/lib/drives/code-derive.ts, so the suite can redeem a code the DB does not hold. */
export function deriveCode(codeId, secret = signingSecret()) {
  const mac = createHmac("sha256", secret).update(`drive-code:${codeId}`, "utf8").digest();
  let out = "";
  for (let i = 0; i < 12; i += 1) out += ALPHABET[mac[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}
export const compact = (code) => code.replace(/-/g, "");

/** The derived code for the entry on `rowNo` of an import. */
export async function codeForRow(importId, rowNo) {
  const [r] = await rows(
    "SELECT c.id FROM drive_codes c JOIN drive_roster_entries e ON e.id = c.entry_id WHERE e.import_id = $1 AND e.row_no = $2",
    [importId, rowNo],
  );
  if (!r) throw new Error(`no code for import ${importId} row ${rowNo}`);
  return deriveCode(r.id);
}

/* ── seeding ──────────────────────────────────────────────────────────────── */

let pwHash;
export const PASSWORD = `E2e-Drive#${RUN}`;
const hashed = async () => (pwHash ??= await hash(PASSWORD, ARGON));

/** A throwaway intern who can log in. `verified:false` leaves the email unverified (the login route refuses it, so such a user is only ever a match candidate). */
export async function seedIntern({ label, first, last, phone = fakePhone(), verified = true, mail }) {
  const addr = mail ?? email(label);
  const [u] = await rows(
    `INSERT INTO users (first_name, last_name, email, email_verified, is_active, country_code, phone_number, password, agreed_to_terms, role, terms_accepted_version, terms_accepted_at)
     VALUES ($1,$2,$3,$4,true,'+91',$5,$6,true,'intern',$7,now()) RETURNING id`,
    [first, last, addr, verified, phone, await hashed(), TERMS_VERSION],
  );
  return { id: u.id, email: addr, phone, first, last, password: PASSWORD };
}

/** A throwaway college plus one placement officer who can log in. */
export async function seedCollege(label) {
  const [c] = await rows(
    "INSERT INTO colleges (name, slug) VALUES ($1,$2) RETURNING id, name",
    [`E2E Drive College ${label} ${RUN}`, `e2e-drive-${label}-${RUN}`],
  );
  const mail = email(`tpo-${label}`);
  const [a] = await rows(
    "INSERT INTO college_admins (college_id, name, email, password, terms_accepted_version, terms_accepted_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id",
    [c.id, `Officer ${label}`, mail, await hashed(), TERMS_VERSION],
  );
  return { id: c.id, name: c.name, tpo: { id: a.id, email: mail, password: PASSWORD } };
}

/** A drive row to hang a drive order on (so activation on payment can be observed). */
export async function seedDrive(collegeId, adminId) {
  const [d] = await rows(
    "INSERT INTO college_drives (college_id, title, starts_at, ends_at, token_hash, created_by) VALUES ($1,$2,now() + interval '1 day', now() + interval '10 days', $3, $4) RETURNING id",
    [collegeId, `E2E Drive ${RUN}`, `e2e-drive-token-${RUN}`, adminId],
  );
  return d.id;
}
