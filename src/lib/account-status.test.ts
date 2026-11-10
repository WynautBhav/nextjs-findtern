import { test } from "node:test";
import assert from "node:assert/strict";

// A database that refuses connections: the real failure path (a pool timeout or an outage looks the same to
// the callers), no mock. Port 1 is never listening.
process.env.DATABASE_URL = "postgres://nobody:nothing@127.0.0.1:1/none";
process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-chars-long";

const { isAccountActive, isPasswordVersionCurrent, isSessionRevoked, isTermsCurrent, currentAdminPermissions } = await import("./account-status.ts");
const { validateSession } = await import("./session-validity.ts");

const session = { sid: "sid-down", uid: "u-down", role: "employer", email: "hr@acme.in", exp: Date.now() + 60_000, pv: "pv1" } as Parameters<typeof validateSession>[0];
const real = {
  isRevoked: isSessionRevoked,
  isActive: isAccountActive,
  isPasswordCurrent: isPasswordVersionCurrent,
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
  await assert.rejects(isAccountActive("employer", "u-down"));
  await assert.rejects(isPasswordVersionCurrent("employer", "u-down", "pv1"));
});

test("a failed lookup is not cached as an answer", async () => {
  await assert.rejects(isAccountActive("intern", "u-again"));
  await assert.rejects(isAccountActive("intern", "u-again"), "the second call must read again, not reuse a guess");
});

test("accepting the terms pop-up is not a session check: it still stays out of the way when the read fails", async () => {
  assert.equal(await isTermsCurrent("employer", "u-down"), true);
});

test("roles that are never deactivated are not looked up", async () => {
  assert.equal(await isAccountActive("admin", "a1"), true);
});
