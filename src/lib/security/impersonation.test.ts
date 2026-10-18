import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-chars-long";

const { createSession, readSession, IMPERSONATION_TTL_MS } = await import("./session.ts");

function tokenOf(cookie: string): string {
  return cookie.split(";")[0].slice("ft_sid=".length);
}

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url");
  return `${body}.${sig}`;
}

test("a View as session carries the admin and expires in an hour", () => {
  const now = Date.now();
  const { cookie, data } = createSession({
    uid: "emp-1",
    role: "employer",
    email: "hr@acme.com",
    impersonator: { uid: "adm-1", email: "ops@findtern.in" },
    now,
    secure: false,
  });
  assert.equal(data.exp, now + IMPERSONATION_TTL_MS);
  const read = readSession(tokenOf(cookie), now + 1000);
  assert.deepEqual(read?.impersonator, { uid: "adm-1", email: "ops@findtern.in" });
  assert.equal(readSession(tokenOf(cookie), now + IMPERSONATION_TTL_MS + 1), null);
});

test("an impersonated session can never be an admin session", () => {
  const token = sign({
    uid: "adm-2",
    role: "admin",
    email: "x@findtern.in",
    exp: Date.now() + 60_000,
    sid: "s",
    impersonator: { uid: "adm-1", email: "ops@findtern.in" },
  });
  assert.equal(readSession(token), null);
});

test("a malformed impersonator is rejected", () => {
  const token = sign({
    uid: "int-1",
    role: "intern",
    email: "a@gmail.com",
    exp: Date.now() + 60_000,
    sid: "s",
    impersonator: "adm-1",
  });
  assert.equal(readSession(token), null);
});

test("ordinary sessions are unaffected", () => {
  const { cookie } = createSession({ uid: "int-1", role: "intern", email: "a@gmail.com", secure: false });
  const read = readSession(tokenOf(cookie));
  assert.equal(read?.impersonator, undefined);
  assert.equal(read?.role, "intern");
});
