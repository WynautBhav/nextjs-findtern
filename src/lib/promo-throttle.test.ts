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
