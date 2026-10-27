import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-chars-long";

const {
  createSession,
  readSession,
  renewSession,
  passwordVersion,
  SESSION_TTL_MS,
  SESSION_MAX_AGE_MS,
  SESSION_RENEW_AFTER_MS,
} = await import("./session.ts");
const { googleConfig, requestOrigin, safeNext } = await import("../google.ts");

function tokenOf(cookie: string): string {
  return cookie.split(";")[0].slice("ft_sid=".length);
}

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url");
  return `${body}.${sig}`;
}

// ── INT-38: sliding sessions ───────────────────────────────────────────

test("a fresh session is not renewed on every request", () => {
  const now = Date.now();
  const { data } = createSession({ uid: "u1", role: "intern", email: "a@gmail.com", now });
  assert.equal(renewSession(data, { now: now + 1000 }), null);
});

test("an active session is renewed with the same identity and a fresh idle timeout", () => {
  const now = Date.now();
  const { data } = createSession({ uid: "u1", role: "employer", email: "hr@acme.in", pv: "abc", now });
  const later = now + SESSION_RENEW_AFTER_MS + 60_000;
  const renewed = renewSession(data, { now: later, secure: true });
  assert.ok(renewed);
  assert.equal(renewed.data.exp, later + SESSION_TTL_MS);
  assert.equal(renewed.data.sid, data.sid, "same session, not a new sign in");
  assert.equal(renewed.data.uid, "u1");
  assert.equal(renewed.data.role, "employer");
  assert.equal(renewed.data.pv, "abc", "the password version survives renewal");
  assert.match(renewed.cookie, /; Secure/);
  const read = readSession(tokenOf(renewed.cookie), later + SESSION_TTL_MS - 1);
  assert.equal(read?.uid, "u1", "renewed cookie verifies and outlives the original expiry");
  assert.equal(readSession(tokenOf(renewed.cookie), later + SESSION_TTL_MS + 1), null, "idle timeout still applies");
});

test("renewal never goes past the absolute maximum age", () => {
  const now = Date.now();
  const { data } = createSession({ uid: "u1", role: "intern", email: "a@gmail.com", now });
  const nearCap = { ...data, exp: data.iat! + SESSION_MAX_AGE_MS };
  const renewed = renewSession(nearCap, { now: data.iat! + SESSION_MAX_AGE_MS - 2 * SESSION_RENEW_AFTER_MS });
  assert.equal(renewed, null, "already at the cap: nothing to extend");
  const capped = renewSession({ ...data, exp: data.iat! + SESSION_MAX_AGE_MS - SESSION_TTL_MS }, {
    now: data.iat! + SESSION_MAX_AGE_MS - SESSION_TTL_MS / 2,
  });
  assert.ok(capped);
  assert.equal(capped.data.exp, data.iat! + SESSION_MAX_AGE_MS);
});

test("View as sessions do not slide", () => {
  const now = Date.now();
  const { data } = createSession({
    uid: "int-1",
    role: "intern",
    email: "a@gmail.com",
    impersonator: { uid: "adm-1", email: "admin@findtern.in" },
    now,
  });
  assert.equal(renewSession(data, { now: now + 50 * 60_000 }), null);
});

// ── INT-26: password change ends other sessions ───────────────────────

test("password version follows the stored password and reveals nothing", () => {
  const a = passwordVersion("$argon2id$v=19$m=19456,t=2,p=1$old");
  const b = passwordVersion("$argon2id$v=19$m=19456,t=2,p=1$new");
  assert.notEqual(a, b, "a new password gives a new version");
  assert.equal(a, passwordVersion("$argon2id$v=19$m=19456,t=2,p=1$old"), "stable for the same value");
  assert.ok(!a.includes("argon2") && a.length === 16);
  assert.notEqual(passwordVersion("plaintext-legacy"), "plaintext-legacy");
});

test("sessions carry the password version and reject a malformed one", () => {
  const { cookie } = createSession({ uid: "u1", role: "intern", email: "a@gmail.com", pv: passwordVersion("x") });
  assert.equal(readSession(tokenOf(cookie))?.pv, passwordVersion("x"));
  const exp = Date.now() + 60_000;
  assert.equal(readSession(sign({ uid: "u1", role: "intern", email: "e", exp, sid: "s", pv: 42 })), null);
  assert.equal(readSession(sign({ uid: "u1", role: "intern", email: "e", exp, sid: "s", iat: "yesterday" })), null);
  // Sessions minted before the field existed still read.
  assert.equal(readSession(sign({ uid: "u1", role: "intern", email: "e", exp, sid: "s" }))?.uid, "u1");
});

// ── INT-07 / EMH-37: ?next= never leaves the site ─────────────────────

test("safeNext keeps only same-site paths", () => {
  assert.equal(safeNext("/intern/proposals/12", "/x"), "/intern/proposals/12");
  assert.equal(safeNext("//evil.example/a", "/x"), "/x");
  assert.equal(safeNext("https://evil.example", "/x"), "/x");
  assert.equal(safeNext("/\\evil.example", "/x"), "/x");
  assert.equal(safeNext(undefined, "/x"), "/x");
});

// ── NC r16: the Google redirect URI follows the deployment ────────────

test("the Google redirect URI is on the origin the request came to", () => {
  const saved = { ...process.env };
  try {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://findtern.in/auth/google/callback";
    const live = new Request("http://127.0.0.1:3000/api/auth/google/start", {
      headers: { host: "findtern.in", "x-forwarded-proto": "https" },
    });
    assert.equal(googleConfig(live)?.redirectUri, "https://findtern.in/auth/google/callback");
    const staging = new Request("https://nextjs-findtern.vercel.app/api/auth/google/start", {
      headers: { host: "nextjs-findtern.vercel.app", "x-forwarded-proto": "https" },
    });
    assert.equal(googleConfig(staging)?.redirectUri, "https://nextjs-findtern.vercel.app/auth/google/callback");
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    assert.equal(googleConfig(staging)?.redirectUri, "https://nextjs-findtern.vercel.app/api/auth/google/callback");
    const junkHost = new Request("http://x/", { headers: { host: "bad host/../" } });
    assert.equal(requestOrigin(junkHost), null);
  } finally {
    process.env = saved;
  }
});
