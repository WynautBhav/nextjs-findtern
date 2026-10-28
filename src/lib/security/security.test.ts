import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.SIGNING_SECRET ||= "test-secret-that-is-at-least-32-characters-long";

const { hashPassword, verifyPassword, needsRehash, isStrongPassword, passwordBackend } =
  await import("./password.ts");
const { sign, verify, generateKey, signedUrl, ReplayGuard, TokenError } =
  await import("./sign.ts");

describe("password", () => {
  test("hashes and verifies", async () => {
    const h = await hashPassword("correct horse battery staple");
    assert.ok(h.startsWith("$argon2") || h.startsWith("scrypt$"), `got ${h.slice(0, 12)}`);
    assert.equal(await verifyPassword("correct horse battery staple", h), true);
    assert.equal(await verifyPassword("wrong password", h), false);
  });

  test("salt makes every hash unique", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    assert.notEqual(a, b, "identical hashes means no salt");
    assert.equal(await verifyPassword("same-password", a), true);
    assert.equal(await verifyPassword("same-password", b), true);
  });

  test("accepts a legacy plaintext row and flags it for rehash", async () => {
    // This is the case that matters on day one: every existing account has a
    // bare-string password. It must still log in, and must be reported for
    // upgrade, or switching the module on locks out every user.
    const legacy = "MyOldPassword123";
    assert.equal(await verifyPassword(legacy, legacy), true);
    assert.equal(await verifyPassword("not-it", legacy), false);
    process.env.PASSWORD_UPGRADE = "on";
    assert.equal(needsRehash(legacy), true, "plaintext must be flagged");
  });

  test("no rehash while PASSWORD_UPGRADE is off (legacy app shares the DB)", () => {
    const prev = process.env.PASSWORD_UPGRADE;
    delete process.env.PASSWORD_UPGRADE;
    assert.equal(needsRehash("MyOldPassword123"), false);
    process.env.PASSWORD_UPGRADE = prev;
  });

  test("a current argon2 hash is not flagged for rehash", async () => {
    const h = await hashPassword("StrongPass123");
    assert.equal(needsRehash(h), false);
  });

  test("a weaker argon2 hash IS flagged so parameters can be raised", async () => {
    const weak = "$argon2id$v=19$m=8192,t=1,p=1$c29tZXNhbHQ$hash";
    assert.equal(needsRehash(weak), true);
  });

  test("round-trips the scrypt format", async () => {
    // Simulate the fallback backend's output shape directly.
    const { randomBytes, scrypt: sc } = await import("node:crypto");
    const { promisify } = await import("node:util");
    const s = promisify(sc) as (
      password: string,
      salt: Buffer,
      keylen: number,
      options: { N: number; r: number; p: number; maxmem: number },
    ) => Promise<Buffer>;
    const salt = randomBytes(16);
    const opts = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
    const key = await s("pw-for-scrypt", salt, 32, opts);
    const stored = `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
    assert.equal(await verifyPassword("pw-for-scrypt", stored), true);
    assert.equal(await verifyPassword("nope", stored), false);
    assert.equal(needsRehash(stored), true);
  });

  test("rejects malformed and empty input without throwing", async () => {
    assert.equal(await verifyPassword("", "x"), false);
    assert.equal(await verifyPassword("x", ""), false);
    assert.equal(await verifyPassword("x", "plaintext$"), false);
    assert.equal(await verifyPassword("x", "scrypt$garbage"), false);
  });

  test("enforces the length ceiling against hash DoS", async () => {
    await assert.rejects(() => hashPassword("a".repeat(2000)), TypeError);
    await assert.rejects(() => hashPassword(""), TypeError);
  });

  test("strength policy matches the legacy rule", () => {
    assert.equal(isStrongPassword("Abcdef1!"), true);
    assert.equal(isStrongPassword("Abcdef12"), false, "needs a special character");
    assert.equal(isStrongPassword("abcdef1!"), false, "needs an upper case");
    assert.equal(isStrongPassword("Abcdefg!"), false, "needs a digit");
    assert.equal(isStrongPassword("Ab1"), false, "needs 8 chars");
    assert.equal(isStrongPassword(""), false);
  });

  test("reports its backend", () => {
    assert.ok(["argon2", "scrypt"].includes(passwordBackend()));
  });
});

describe("signed tokens", () => {
  const base = { k: generateKey("intern-42"), s: "intern-42", d: "aadhaar" };

  test("signs and verifies", () => {
    const t = sign(base, 300);
    const p = verify(t);
    assert.equal(p.k, base.k);
    assert.equal(p.s, base.s);
    assert.equal(p.d, base.d);
  });

  test("rejects a tampered payload", () => {
    const t = sign(base, 300);
    const [body, sig] = t.split(".");
    // Swap the subject for another user's.
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), s: "intern-99" }),
    ).toString("base64url");
    assert.throws(() => verify(`${forged}.${sig}`), (e) => e instanceof TokenError && e.reason === "bad-signature");
  });

  test("rejects a tampered signature", () => {
    const t = sign(base, 300);
    const [body, sig] = t.split(".");
    const flipped = Buffer.from(sig, "base64url");
    flipped[0] ^= 0xff;
    assert.throws(
      () => verify(`${body}.${flipped.toString("base64url")}`),
      (e) => e instanceof TokenError && e.reason === "bad-signature",
    );
  });

  test("rejects a token signed with a different secret", async () => {
    const t = sign(base, 300);
    const real = process.env.SIGNING_SECRET!;
    process.env.SIGNING_SECRET = "a-completely-different-secret-of-32-chars";
    assert.throws(() => verify(t), (e) => e instanceof TokenError && e.reason === "bad-signature");
    process.env.SIGNING_SECRET = real;
  });

  test("expires", () => {
    const t = sign(base, 1);
    const later = Date.now() + 2000;
    assert.throws(() => verify(t, later), (e) => e instanceof TokenError && e.reason === "expired");
  });

  test("rejects garbage", () => {
    for (const bad of ["", "nodot", "a.b", "....", "x"]) {
      assert.throws(() => verify(bad), (e) => e instanceof TokenError);
    }
  });

  test("keys leak no filename information", () => {
    const k = generateKey("intern-42");
    assert.ok(k.startsWith("intern-42."), k);
    assert.equal(k.split(".")[1].length, 24, "24 chars of base64url = 18 bytes");
    // Two keys for the same subject differ, so keys are not guessable from
    // the subject.
    assert.notEqual(generateKey("intern-42"), generateKey("intern-42"));
  });

  test("ttl is applied, not silently ignored", () => {
    // Regression: an earlier version of sign() accepted ttl but never set `e`,
    // so every issued token was born expired.
    const p = verify(sign(base, 60));
    const life = p.e - p.i;
    assert.equal(life, 60, `expected a 60s life, got ${life}s`);
  });

  test("builds a redeemable url", () => {
    const url = signedUrl("/api/uploads/x", base, 120);
    assert.ok(url.includes("/api/uploads/x?t="));
  });

  test("replay guard blocks a second presentation of the same nonce", () => {
    const guard = new ReplayGuard();
    const p = verify(sign(base, 300));
    assert.equal(guard.check(p.n), true, "first use");
    assert.equal(guard.check(p.n), false, "second use must fail");
  });

  test("replay guard forgets expired entries", () => {
    const guard = new ReplayGuard();
    const now = Date.now();
    assert.equal(guard.check("abc", now), true);
    assert.equal(guard.check("abc", now + 6 * 60_000), true, "entry aged out");
  });
});

test("QA-016: the stated rule and the validator agree at the boundary", async () => {
  const { isStrongPassword, PASSWORD_HINT, WEAK_PASSWORD_MESSAGE, PASSWORD_RULES } = await import("../password-policy.ts");
  // The tester's case: meets a rule that forgets the special character.
  assert.equal(isStrongPassword("Abcdefg1"), false);
  assert.equal(isStrongPassword("Abcdef1!"), true, "8 characters with every kind passes");
  assert.equal(isStrongPassword("Abcde1!"), false, "7 characters fails");
  // Every rule the validator checks is named in both the hint and the message.
  for (const r of PASSWORD_RULES.slice(1)) {
    assert.ok(PASSWORD_HINT.includes(r.label), `hint names ${r.label}`);
    assert.ok(WEAK_PASSWORD_MESSAGE.includes(r.label), `message names ${r.label}`);
  }
  assert.match(PASSWORD_HINT, /^At least 8 characters/);
});

describe("auth limits per address + account (QA-138)", async () => {
  const { RateLimiter, takeAuth } = await import("./rate-limit.ts");

  test("30 students on one campus address each get their own budget", () => {
    const login = new RateLimiter(8, 15 * 60_000);
    for (let i = 0; i < 30; i++) assert.equal(takeAuth(login, "t-campus", "10.0.0.1", `s${i}@gmail.com`), true);
  });

  test("one account is still capped from one address", () => {
    const login = new RateLimiter(8, 15 * 60_000);
    for (let i = 0; i < 8; i++) assert.equal(takeAuth(login, "t-guess", "10.0.0.2", "a@gmail.com"), true);
    assert.equal(takeAuth(login, "t-guess", "10.0.0.2", "a@gmail.com"), false);
  });

  test("one address spraying many accounts hits the ceiling", () => {
    const login = new RateLimiter(8, 15 * 60_000);
    let allowed = 0;
    for (let i = 0; i < 400; i++) if (takeAuth(login, "t-spray", "10.0.0.3", `x${i}@gmail.com`)) allowed++;
    assert.equal(allowed, 150);
  });
});
