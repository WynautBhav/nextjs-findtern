import { test } from "node:test";
import assert from "node:assert/strict";

// A database that refuses connections: the real failure path (a pool timeout or an outage looks the same to
// the callers), no mock. Port 1 is never listening.
process.env.DATABASE_URL = "postgres://nobody:nothing@127.0.0.1:1/none";
process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-chars-long";

const { loadSessionFacts, passwordVersionCurrent, isSessionRevoked, isTermsCurrent, currentAdminPermissions } = await import("./account-status.ts");
const { validateSession } = await import("./session-validity.ts");

const session = { sid: "sid-down", uid: "u-down", role: "employer", email: "hr@acme.in", exp: Date.now() + 60_000, pv: "pv1" } as Parameters<typeof validateSession>[0];
// The same wiring as getSessionState: one facts read shared by the three per-account checks.
const factsFor = (s: typeof session) => loadSessionFacts(s.role, s.uid, s.sid);
const real = {
  isRevoked: async () => (await factsFor(session)).revoked,
  isActive: async () => (await factsFor(session)).active,
  isPasswordCurrent: async () => passwordVersionCurrent(session.role, session.pv, (await factsFor(session)).pv),
  adminPermissions: currentAdminPermissions,
};

test("when the database cannot be read, a session is refused, not accepted", async () => {
  assert.equal(await validateSession(session, real), null);
});

test("an admin session is refused when its permissions cannot be read", async () => {
  const admin = { ...session, role: "admin", uid: "a-down", sid: "sid-admin" } as typeof session;
  // Only the permission read fails here: every other check says yes.
  const checks = { ...real, isRevoked: async () => false, isActive: async () => true, isPasswordCurrent: async () => true };
  assert.equal(await validateSession(admin, checks), null);
});

test("each validity read reports a failed lookup instead of answering for it", async () => {
  await assert.rejects(isSessionRevoked("sid-down"));
  await assert.rejects(loadSessionFacts("employer", "u-down", "sid-down"));
});

test("a failed lookup is not cached as an answer", async () => {
  await assert.rejects(loadSessionFacts("intern", "u-again", "s"));
  await assert.rejects(loadSessionFacts("intern", "u-again", "s"), "the second call must read again, not reuse a guess");
});

test("password version: a missing session version is only accepted for roles that predate the check", () => {
  assert.equal(passwordVersionCurrent("intern", undefined, "x"), true);
  assert.equal(passwordVersionCurrent("college", undefined, "x"), false);
  assert.equal(passwordVersionCurrent("employer", "a", "a"), true);
  assert.equal(passwordVersionCurrent("employer", "a", "b"), false);
  assert.equal(passwordVersionCurrent("employer", "a", null), false);
});

test("the account-active decision is never served from the per-process cache (no staleness window)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./account-status.ts", import.meta.url), "utf8");
  const facts = src.slice(src.indexOf("export async function loadSessionFacts"), src.indexOf("export function passwordVersionCurrent"));
  assert.ok(!/cache\.|readStatus|TTL_MS/.test(facts), "loadSessionFacts must read the database every time");
  const revoked = src.slice(src.indexOf("export async function isSessionRevoked"), src.indexOf("export async function revokeSession"));
  assert.ok(!/revokedCache|TTL_MS/.test(revoked), "isSessionRevoked must read the database every time");
});

test("accepting the terms pop-up is not a session check: it still stays out of the way when the read fails", async () => {
  assert.equal(await isTermsCurrent("employer", "u-down"), true);
});

test("an admin's session is read from the database too (a removed admin is not 'active')", async () => {
  await assert.rejects(loadSessionFacts("admin", "a1", "s"));
});
