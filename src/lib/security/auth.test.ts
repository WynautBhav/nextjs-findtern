import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";

process.env.SIGNING_SECRET ||= "test-secret-that-is-at-least-32-characters-long";
process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-chars-long";

const ROOT = await mkdtemp(join(tmpdir(), "ft-uploads-"));
process.env.UPLOAD_ROOT = ROOT;

const store = await import("./store.ts");
const {
  createSession, readSession, readCookie, clearCookie, csrfToken, checkCsrf,
} = await import("./session.ts");
const { canAccess, requireSession, requireOwned, requireRole, requireVisibleToEmployer } =
  await import("./guards.ts");
const {
  RateLimiter, limiters, bucketKey, clientIp, generateOtp, hashOtp, verifyOtp,
  generateEmailToken,
} = await import("./rate-limit.ts");

const png = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4" +
    "890000000a49444154789c6360000002000100ffff03000006000557bfabd400" +
    "00000049454e44ae426082",
  "hex",
);

after(async () => { await rm(ROOT, { recursive: true, force: true }); });

describe("private store", () => {
  test("round-trips bytes", async () => {
    const f = await store.put("intern-7", png, "image/png");
    assert.match(f.key, /^intern-7\.[A-Za-z0-9_-]{24}\.png$/);
    assert.deepEqual(await store.read(f.key), png);
    assert.equal(await store.exists(f.key), true);
  });

  test("nothing is written under public/", async () => {
    const f = await store.put("intern-8", png, "image/png");
    assert.ok(!f.key.includes(".."));
    assert.equal(store.uploadRoot().startsWith(process.cwd() + "/public"), false);
  });

  test("two uploads of the same bytes get different keys", async () => {
    const a = await store.put("intern-9", png, "image/png");
    const b = await store.put("intern-9", png, "image/png");
    assert.notEqual(a.key, b.key, "identical content must not produce a shared key");
  });

  test("rejects path traversal", async () => {
    for (const bad of [
      "../../../etc/passwd",
      "../secret.png",
      "..%2F..%2Fetc%2Fpasswd",
      "/etc/passwd",
      "intern-1.x/../../escape.png",
    ]) {
      await assert.rejects(() => store.read(bad), /Malformed key|escapes/, `allowed: ${bad}`);
    }
  });

  test("rejects a non-whitelisted extension", async () => {
    // Storing an .html or .svg would let an uploader plant a stored-XSS file
    // on our own origin.
    for (const bad of [
      "intern-1.aaaaaaaaaaaaaaaaaaaaaaaa.html",
      "intern-1.aaaaaaaaaaaaaaaaaaaaaaaa.svg",
      "intern-1.aaaaaaaaaaaaaaaaaaaaaaaa.js",
      "intern-1.aaaaaaaaaaaaaaaaaaaaaaaa",
    ]) {
      await assert.rejects(() => store.read(bad), /Malformed key/);
    }
  });

  test("rejects a short or missing random component", async () => {
    await assert.rejects(() => store.read("intern-1.short.png"), /Malformed key/);
    await assert.rejects(() => store.read(".png"), /Malformed key/);
  });

  test("enforces the size cap", async () => {
    await assert.rejects(
      () => store.put("intern-7", Buffer.alloc(store.MAX_BYTES + 1), "image/png"),
      /exceeds/,
    );
  });

  test("rejects disallowed content types", async () => {
    await assert.rejects(
      () => store.put("intern-7", Buffer.from("<script>"), "text/html"),
      /Unsupported/,
    );
    await assert.rejects(
      () => store.put("intern-7", Buffer.from("x"), "application/x-msdownload"),
      /Unsupported/,
    );
  });

  test("rejects an empty file", async () => {
    await assert.rejects(() => store.put("intern-7", Buffer.alloc(0), "image/png"), /Empty/);
  });

  test("removes a file", async () => {
    const f = await store.put("intern-10", png, "image/png");
    await store.remove(f.key);
    assert.equal(await store.exists(f.key), false);
  });

  test("maps extensions to content types", () => {
    assert.equal(store.contentTypeFor("a.b.jpg"), "image/jpeg");
    assert.equal(store.contentTypeFor("a.b.pdf"), "application/pdf");
    assert.equal(store.contentTypeFor("a.b.png"), "image/png");
  });
});

describe("sessions", () => {
  test("creates and reads", () => {
    const { cookie, data } = createSession({ uid: "7", role: "intern", email: "a@b.c", secure: true });
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    const token = readCookie(cookie)!;
    const read = readSession(token)!;
    assert.equal(read.uid, "7");
    assert.equal(read.role, "intern");
    assert.equal(read.sid, data.sid);
  });

  test("rejects a tampered session", () => {
    const { cookie } = createSession({ uid: "7", role: "intern", email: "a@b.c" });
    const token = readCookie(cookie)!;
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), role: "admin" }),
    ).toString("base64url");
    assert.equal(readSession(`${forged}.${sig}`), null, "role escalation must fail");
    assert.equal(readSession(`${body}.${Buffer.from("nope").toString("base64url")}`), null);
  });

  test("rejects an expired session", () => {
    const { cookie } = createSession({ uid: "7", role: "intern", email: "a@b.c", ttlMs: 1000 });
    assert.equal(readSession(readCookie(cookie)!, Date.now() + 2000), null);
  });

  test("rejects a bogus role", () => {
    const { cookie } = createSession({ uid: "7", role: "intern", email: "a@b.c" });
    const token = readCookie(cookie)!;
    const [body] = token.split(".");
    const bad = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), role: "superuser" }),
    ).toString("base64url");
    const hmac = createHmac("sha256", process.env.SESSION_SECRET!).update(bad).digest("base64url");
    assert.equal(readSession(`${bad}.${hmac}`), null, "unknown role must not authenticate");
  });

  test("readCookie is not confused by other cookies", () => {
    const h = "theme=dark; ft_sid=abc123; other=1";
    assert.equal(readCookie(h), "abc123");
    assert.equal(readCookie("theme=dark"), null);
    assert.equal(readCookie(null), null);
  });

  test("clearCookie expires the session", () => {
    assert.match(clearCookie(), /Max-Age=0/);
  });
});

describe("guards", () => {
  // A real Cookie header, not a bare token - the guards take the header.
  const cookieFor = (uid: string, role: "intern" | "employer" | "admin") =>
    createSession({ uid, role, email: `${uid}@x.y` }).cookie;

  test("no session is 401, not 403", () => {
    const r = requireSession(null);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.status, 401);
  });

  test("ownership: own record allowed", () => {
    const c = cookieFor("7", "intern");
    const r = requireOwned(c, "7");
    assert.equal(r.ok, true);
  });

  test("ownership: someone else's record is 403", () => {
    // This is the /api/interns/:internId vulnerability. Intern 7 asking for
    // intern 2 must not succeed.
    const r = requireOwned(cookieFor("7", "intern"), "2");
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.status, 403);
  });

  test("ownership: sequential ids are all blocked", () => {
    const c = cookieFor("7", "intern");
    for (const id of ["1", "2", "3", "6", "8", "9", "100"]) {
      assert.equal(requireOwned(c, id).ok, false, `intern 7 read ${id}`);
    }
  });

  test("ownership: empty and null ids are rejected", () => {
    const c = cookieFor("7", "intern");
    for (const id of ["", null, undefined, "0"]) {
      const r = requireOwned(c, id);
      assert.equal(r.ok, false, `id ${JSON.stringify(id)} slipped through`);
    }
  });

  test("admin may read anything", () => {
    assert.equal(canAccess({ uid: "1", role: "admin", email: "", exp: 0, sid: "" }, "999"), true);
  });

  test("roles are enforced", () => {
    const intern = cookieFor("7", "intern");
    assert.equal(requireRole(intern, ["admin"]).ok, false);
    assert.equal(requireRole(intern, ["intern"]).ok, true);
  });

  test("employer cannot use the intern route", () => {
    const emp = cookieFor("3", "employer");
    assert.equal(requireRole(emp, ["intern"]).ok, false);
  });

  test("employer applicant read requires both matching id and a real application", () => {
    const emp = cookieFor("3", "employer");
    // Right session, wrong employer id in the path.
    assert.equal(requireVisibleToEmployer(emp, "4", () => true).ok, false);
    // Right id, but no application from that applicant.
    assert.equal(requireVisibleToEmployer(emp, "3", () => false).ok, false);
    // Right id and a real application.
    assert.equal(requireVisibleToEmployer(emp, "3", () => true).ok, true);
  });

  test("an intern cannot reach the employer applicant route at all", () => {
    const intern = cookieFor("7", "intern");
    const r = requireVisibleToEmployer(intern, "7", () => true);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.status, 403);
  });
});

describe("csrf", () => {
  test("accepts a matching header and cookie", () => {
    const { cookie, header } = csrfToken();
    assert.equal(checkCsrf(header, cookie), true);
  });

  test("rejects a mismatch, a missing header and a missing cookie", () => {
    const { cookie, header } = csrfToken();
    assert.equal(checkCsrf("wrong", cookie), false);
    assert.equal(checkCsrf(header, null), false);
    assert.equal(checkCsrf(null, cookie), false);
    assert.equal(checkCsrf(null, null), false);
  });

  test("rejects a prefix of the real token", () => {
    const { cookie, header } = csrfToken();
    assert.equal(checkCsrf(header.slice(0, -1), cookie), false);
  });
});

describe("rate limiting", () => {
  test("blocks after the limit", () => {
    const rl = new RateLimiter(3, 60_000);
    assert.equal(rl.take("a"), true);
    assert.equal(rl.take("a"), true);
    assert.equal(rl.take("a"), true);
    assert.equal(rl.take("a"), false, "4th request must be blocked");
    assert.equal(rl.take("a"), false);
  });

  test("resets when the window expires", () => {
    const rl = new RateLimiter(1, 1000);
    assert.equal(rl.take("a"), true);
    assert.equal(rl.take("a"), false);
    assert.equal(rl.take("a", Date.now() + 2000), true);
  });

  test("keys are independent", () => {
    const rl = new RateLimiter(1, 60_000);
    assert.equal(rl.take("a"), true);
    assert.equal(rl.take("b"), true);
  });

  test("reports remaining and retry-after", () => {
    const rl = new RateLimiter(3, 60_000);
    rl.take("a"); rl.take("a");
    assert.equal(rl.remaining("a"), 1);
    assert.ok(rl.retryAfterSeconds("a") > 0);
  });

  test("bucketing does not let one IP lock out a user's global budget", () => {
    // The DoS shape: attacker sprays user@example.com from many IPs.
    const k1 = bucketKey("1.1.1.1", "user@example.com");
    const k2 = bucketKey("2.2.2.2", "user@example.com");
    assert.notEqual(k1, k2);
    // But the same IP+user is one bucket, so brute force is throttled.
    assert.equal(bucketKey("1.1.1.1", "user@example.com"), bucketKey("1.1.1.1", "USER@example.com"));
  });

  test("the email is not stored in the bucket key", () => {
    assert.ok(!bucketKey("1.1.1.1", "user@example.com").includes("example.com"));
  });

  test("forwarding headers are ignored unless a proxy is trusted", () => {
    const h = (m: Record<string, string>) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });
    const saved = { trust: process.env.TRUST_PROXY, vercel: process.env.VERCEL };
    try {
      delete process.env.TRUST_PROXY;
      delete process.env.VERCEL;
      // A spoofed header must not pick the caller's bucket.
      assert.equal(clientIp(h({ "x-forwarded-for": "9.9.9.9" })), "unknown");
      assert.equal(clientIp(h({ "x-real-ip": "7.7.7.7" })), "unknown");

      process.env.TRUST_PROXY = "1";
      // Behind nginx the right-most entry is the peer nginx saw; a value the
      // client pre-filled sits to its left and is ignored.
      assert.equal(clientIp(h({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" })), "8.8.8.8");
      assert.equal(clientIp(h({ "x-real-ip": "7.7.7.7" })), "7.7.7.7");
      assert.equal(clientIp(h({})), "unknown");
    } finally {
      if (saved.trust === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = saved.trust;
      if (saved.vercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = saved.vercel;
    }
  });

  test("login limiter is actually tight", () => {
    assert.ok(limiters.login.remaining("x") <= 8);
  });
});

describe("otp", () => {
  test("generates 6 digits", () => {
    for (let i = 0; i < 200; i++) {
      const otp = generateOtp();
      assert.match(otp, /^\d{6}$/);
    }
  });

  test("does not repeat over many draws", () => {
    // A Math.random() xorshift falls into a visible cycle quickly; 2000 CSPRNG
    // draws should have no collision. This is a cheap smoke test, not a proof
    // of CSPRNG quality.
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(generateOtp());
    assert.ok(seen.size > 1990, `only ${seen.size}/2000 distinct`);
  });

  test("hashes and verifies", () => {
    const otp = generateOtp();
    const salt = "salt123";
    const h = hashOtp(otp, salt);
    assert.equal(verifyOtp(otp, salt, h), true);
    assert.equal(verifyOtp("000000" === otp ? "111111" : "000000", salt, h), false);
    assert.equal(verifyOtp(otp, "other-salt", h), false, "salt must be bound");
  });

  test("the hash is not the otp", () => {
    const otp = generateOtp();
    assert.notEqual(hashOtp(otp, "s"), otp);
    assert.ok(!hashOtp(otp, "s").includes(otp));
  });

  test("email tokens are long and unique", () => {
    const a = generateEmailToken();
    const b = generateEmailToken();
    assert.notEqual(a, b);
    assert.ok(a.length >= 40, `only ${a.length} chars`);
  });
});
