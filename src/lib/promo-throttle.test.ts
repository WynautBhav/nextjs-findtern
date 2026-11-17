import assert from "node:assert/strict";
import { test } from "node:test";

import { RateLimiter } from "./security/rate-limit.ts";
import { chargePromoMiss, promoGuessBlock } from "./promo-throttle.ts";

const fresh = () => ({ user: new RateLimiter(8, 15 * 60_000), ip: new RateLimiter(30, 15 * 60_000) });
const T0 = 2_000_000;

test("valid codes never spend the budget: only misses are charged", () => {
  const t = fresh();
  for (let i = 0; i < 100; i++) assert.deepEqual(promoGuessBlock({ uid: "e1", ip: "1.1.1.1", now: T0 + i }, t), { blocked: false });
});

test("the 9th wrong guess in 15 minutes by one account is refused, with a retry time", () => {
  const t = fresh();
  for (let i = 0; i < 8; i++) {
    assert.equal(promoGuessBlock({ uid: "e1", ip: "1.1.1.1", now: T0 + i }, t).blocked, false);
    chargePromoMiss({ uid: "e1", ip: "1.1.1.1", now: T0 + i }, t);
  }
  const b = promoGuessBlock({ uid: "e1", ip: "1.1.1.1", now: T0 + 50 }, t);
  assert.equal(b.blocked, true);
  assert.ok(b.blocked && b.retryAfterSeconds > 800 && b.retryAfterSeconds <= 900);
  // another account on another address is unaffected
  assert.equal(promoGuessBlock({ uid: "e2", ip: "2.2.2.2", now: T0 + 50 }, t).blocked, false);
});

test("after the window the account may guess again", () => {
  const t = fresh();
  for (let i = 0; i < 8; i++) chargePromoMiss({ uid: "e1", ip: "1.1.1.1", now: T0 }, t);
  assert.equal(promoGuessBlock({ uid: "e1", ip: "1.1.1.1", now: T0 + 15 * 60_000 + 1 }, t).blocked, false);
});

test("one address walking many accounts is capped at 30 misses", () => {
  const t = fresh();
  for (let i = 0; i < 30; i++) chargePromoMiss({ uid: `acct${i}`, ip: "9.9.9.9", now: T0 + i }, t);
  assert.equal(promoGuessBlock({ uid: "fresh", ip: "9.9.9.9", now: T0 + 40 }, t).blocked, true);
});

// ---- full-waiver redemptions: a tighter budget, spent on every attempt (a valid code too) ----

import { chargeWaiverRedeem, waiverRedeemBlock } from "./promo-throttle.ts";

const waiverTiers = () => ({ user: new RateLimiter(5, 60 * 60_000), ip: new RateLimiter(20, 60 * 60_000) });

test("a full-waiver redemption is charged even when the code is valid: 5 per hour per account, then refused with a retry time", () => {
  const t = waiverTiers();
  for (let i = 0; i < 5; i++) {
    assert.equal(waiverRedeemBlock({ uid: "e1", ip: "1.1.1.1", now: T0 + i }, t).blocked, false);
    chargeWaiverRedeem({ uid: "e1", ip: "1.1.1.1", now: T0 + i }, t);
  }
  const b = waiverRedeemBlock({ uid: "e1", ip: "1.1.1.1", now: T0 + 10 }, t);
  assert.equal(b.blocked, true);
  assert.ok(b.blocked && b.retryAfterSeconds > 3500 && b.retryAfterSeconds <= 3600);
  assert.equal(waiverRedeemBlock({ uid: "e2", ip: "2.2.2.2", now: T0 + 10 }, t).blocked, false, "another account on another address is not affected");
});

test("one address across many accounts is capped at 20 waiver redemptions an hour", () => {
  const t = waiverTiers();
  for (let i = 0; i < 20; i++) chargeWaiverRedeem({ uid: `a${i}`, ip: "9.9.9.9", now: T0 }, t);
  assert.equal(waiverRedeemBlock({ uid: "fresh", ip: "9.9.9.9", now: T0 + 5 }, t).blocked, true);
});

test("the waiver budget is tighter than the ordinary promo budget, and never bypassable", async () => {
  const { limiters } = await import("./security/rate-limit.ts");
  assert.ok(limiters.promoWaiverUser.remaining("x") < limiters.promoMissUser.remaining("x") + 1);
  assert.equal(limiters.promoWaiverUser.remaining("x"), 5);
  assert.equal(limiters.promoWaiverIp.remaining("x"), 20);
  const old = process.env.RATE_LIMIT_BYPASS_IPS;
  process.env.RATE_LIMIT_BYPASS_IPS = "pwi:7.7.7.7";
  for (let i = 0; i < 20; i++) limiters.promoWaiverIp.take("pwi:7.7.7.7");
  assert.equal(limiters.promoWaiverIp.take("pwi:7.7.7.7"), false);
  if (old === undefined) delete process.env.RATE_LIMIT_BYPASS_IPS; else process.env.RATE_LIMIT_BYPASS_IPS = old;
});
