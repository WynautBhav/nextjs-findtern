import { test } from "node:test";
import assert from "node:assert/strict";

const { validateSession, sessionVerdict } = await import("./session-validity.ts");

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

test("a removed admin fails, and so does one whose permission lookup failed", async () => {
  assert.equal(await validateSession(admin, checks({ adminPermissions: async () => null })), null);
  assert.equal(await validateSession(admin, checks({ adminPermissions: async () => undefined })), null);
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

// A check that cannot answer (pool timeout, outage) must not let the session through.
test("a check that throws signs the session out", async () => {
  for (const name of ["isRevoked", "isActive", "isPasswordCurrent"] as const) {
    const out = await validateSession(session, checks({ [name]: async () => { throw new Error("timeout exceeded when trying to connect"); } }));
    assert.equal(out, null, `${name} failing must fail closed`);
  }
});

test("an admin whose permissions could not be read is signed out", async () => {
  const admin = { ...session, role: "admin" } as typeof session;
  assert.equal(await validateSession(admin, checks({ adminPermissions: async () => undefined })), null);
});

test("an impersonated admin session never needs the permission read", async () => {
  const viewing = { ...session, role: "admin", impersonator: "root" } as unknown as typeof session;
  assert.equal(await validateSession(viewing, checks({ adminPermissions: async () => undefined })), viewing);
});

test("verdict: a deactivated account with an otherwise good session is 'disabled', everything else 'signed_out'", async () => {
  assert.deepEqual(await sessionVerdict(session, checks({ isActive: async () => false })), { session: null, denied: "disabled" });
  // Revoked or password-changed sessions never learn the account state, even if it is also disabled.
  assert.deepEqual(await sessionVerdict(session, checks({ isActive: async () => false, isRevoked: async () => true })), { session: null, denied: "signed_out" });
  assert.deepEqual(await sessionVerdict(session, checks({ isActive: async () => false, isPasswordCurrent: async () => false })), { session: null, denied: "signed_out" });
  assert.deepEqual(await sessionVerdict(session, checks({ isRevoked: async () => { throw new Error("pool timeout"); } })), { session: null, denied: "signed_out" });
  assert.equal((await sessionVerdict(session, checks())).session, session);
});

test("one shared facts read still means one round trip: the three checks resolve together", async () => {
  let reads = 0;
  const read = async () => { reads++; await new Promise((r) => setTimeout(r, 10)); return { revoked: false, active: true }; };
  const t0 = Date.now();
  let facts: Promise<{ revoked: boolean; active: boolean }> | undefined;
  const once = () => (facts ??= read());
  await validateSession(session, checks({ isRevoked: async () => (await once()).revoked, isActive: async () => (await once()).active, isPasswordCurrent: async () => (await once(), true) }));
  assert.equal(reads, 1);
  assert.ok(Date.now() - t0 < 40, "checks must not run one after another");
});

test("a frozen (on hold) account: the session is rejected at the next request with denied=held, not signed_out", async () => {
  const frozen = checks({ isHeld: async () => true });
  assert.equal(await validateSession(session, frozen), null);
  assert.deepEqual(await sessionVerdict(session, frozen), { session: null, denied: "held" });
});

test("unfreezing restores the same session (nothing was revoked)", async () => {
  let held = true;
  const c = checks({ isHeld: async () => held });
  assert.equal(await validateSession(session, c), null);
  held = false;
  assert.equal(await validateSession(session, c), session);
});

test("an admin's View-as session on a frozen account is not blocked; a revoked one still is", async () => {
  const viewAs = { ...session, impersonator: { uid: "a1", email: "admin@findtern.in" } } as typeof session;
  assert.equal(await validateSession(viewAs, checks({ isHeld: async () => true })), viewAs);
  assert.equal(await validateSession(viewAs, checks({ isHeld: async () => true, isRevoked: async () => true })), null);
});

test("held beats nothing: disabled still reports disabled first", async () => {
  assert.deepEqual(await sessionVerdict(session, checks({ isActive: async () => false, isHeld: async () => true })), { session: null, denied: "disabled" });
});
