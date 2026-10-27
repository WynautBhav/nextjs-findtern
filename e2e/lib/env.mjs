/**
 * Shared configuration and the one safety rule for the e2e suite: it only
 * ever talks to a database on this machine.
 *
 * The repo's `.env` in other worktrees holds a LIVE database URL, and
 * `.env.local` here may point at the dev cluster on 5432. Both are bypassed:
 * the orchestrator sets DATABASE_URL explicitly in the server's environment
 * (Next gives process.env precedence over every .env file), and this module
 * refuses to hand out a URL whose host is not loopback.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const ROOT = resolve(E2E_DIR, "..");
export const ARTIFACTS = join(E2E_DIR, ".artifacts");

export const DEFAULT_DATABASE_URL = "postgresql://findtern:findtern_dev@localhost:5433/findtern_e2e";
export const SEED_PASSWORD = "Findtern@2026";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** The test DB URL, or a thrown error when it is not on this machine. */
export function testDatabaseUrl(raw = process.env.DATABASE_URL) {
  const url = (raw ?? "").trim() || DEFAULT_DATABASE_URL;
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`Refusing to run: DATABASE_URL is not a valid URL`);
  }
  if (!LOOPBACK.has(host)) {
    throw new Error(`Refusing to run: DATABASE_URL host "${host}" is not localhost/127.0.0.1/::1`);
  }
  return url;
}

export function port() {
  const p = Number(process.env.E2E_PORT || 3300);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) throw new Error(`Bad E2E_PORT: ${process.env.E2E_PORT}`);
  return p;
}

export function baseUrl() {
  return process.env.E2E_BASE_URL || `http://localhost:${port()}`;
}

/** Where MAIL_MODE=log writes (mailer.ts: process.cwd()/logs/mail). */
export const MAIL_DIR = join(ROOT, "logs", "mail");
