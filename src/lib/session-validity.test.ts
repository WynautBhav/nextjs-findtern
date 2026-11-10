import { test } from "node:test";
import assert from "node:assert/strict";

const { validateSession } = await import("./session-validity.ts");

type Checks = Parameters<typeof validateSession>[1];

const session = { sid: "sid-1", uid: "u1", role: "intern", email: "a@gmail.com", exp: Date.now() + 60_000, pv: "pv1" } as Parameters<typeof validateSession>[0];

function checks(over: Partial<Checks> = {}): Checks {
  return {
    isRevoked: async () => false,
    isActive: async () => true,
    isPasswordCurrent: async () => true,
    adminPermissions: async () => undefined,
    ...over,
  };
}

test("a valid session passes through unchanged", async () => {
  assert.equal(await validateSession(session, checks()), session);
});

test("a revoked session still fails, even when the account is active and the password current", async () => {
  assert.equal(await validateSession(session, checks({ isRevoked: async (sid) => sid === "sid-1" })), null);
});

test("an inactive account fails", async () => {
  assert.equal(await validateSession(session, checks({ isActive: async () => false })), null);
});

test("a stale password version fails", async () => {
  assert.equal(await validateSession(session, checks({ isPasswordCurrent: async () => false })), null);
});

test("the independent checks start together, not one after another", async () => {
  const started: string[] = [];
  const slow = (name: string, value: boolean) => async () => {
    started.push(name);
    await new Promise((r) => setTimeout(r, 20));
    return value;
  };
  const t0 = Date.now();
  await validateSession(session, checks({
    isRevoked: slow("revoked", false),
    isActive: slow("active", true),
    isPasswordCurrent: slow("pv", true),
  }));
  assert.deepEqual(started, ["revoked", "active", "pv"]);
  assert.ok(Date.now() - t0 < 55, "three 20ms checks must overlap");
});

const admin = { ...session, role: "admin", pv: "pv1" } as typeof session;

test("an admin gets their current permissions", async () => {
  const out = await validateSession(admin, checks({ adminPermissions: async () => ["orders.read"] }));
  assert.deepEqual(out?.permissions, ["orders.read"]);
});

test("a removed admin fails, a failed permission lookup keeps the session's own list", async () => {
  assert.equal(await validateSession(admin, checks({ adminPermissions: async () => null })), null);
  assert.equal(await validateSession(admin, checks({ adminPermissions: async () => undefined })), admin);
});

test("a revoked admin session fails even though the permission lookup succeeds", async () => {
  assert.equal(await validateSession(admin, checks({ isRevoked: async () => true, adminPermissions: async () => ["*"] })), null);
});

test("an impersonating admin session does not look up admin permissions", async () => {
  let called = false;
  const imp = { ...admin, impersonator: { uid: "a", email: "a@x.in" } } as typeof session;
  const out = await validateSession(imp, checks({ adminPermissions: async () => { called = true; return ["*"]; } }));
  assert.equal(out, imp);
  assert.equal(called, false);
});
