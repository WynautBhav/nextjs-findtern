import { test } from "node:test";
import assert from "node:assert/strict";

import { SHRINK_MAX_PX, SHRINK_TARGET_BYTES, fitWithin, shrinkPlan, shrinkWith } from "./image-shrink.ts";

test("fitWithin: keeps aspect, caps the long side, never enlarges", () => {
  assert.deepEqual(fitWithin(4000, 3000, 2000), { width: 2000, height: 1500 });
  assert.deepEqual(fitWithin(3000, 4000, 2000), { width: 1500, height: 2000 });
  assert.deepEqual(fitWithin(800, 600, 2000), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(9000, 1, 2000), { width: 2000, height: 1 });
});

test("shrinkPlan: first try is full size within 2000px, every try keeps the aspect, quality never rises within a size", () => {
  const plan = shrinkPlan(4032, 3024);
  assert.deepEqual([plan[0].width, plan[0].height], [2000, 1500]);
  for (const a of plan) {
    assert.ok(Math.max(a.width, a.height) <= SHRINK_MAX_PX);
    assert.ok(Math.abs(a.width / a.height - 4032 / 3024) < 0.01, `aspect ${a.width}x${a.height}`);
    assert.ok(a.quality > 0 && a.quality < 1);
  }
  for (let i = 1; i < plan.length; i++) {
    const same = plan[i].width === plan[i - 1].width;
    assert.ok(same ? plan[i].quality < plan[i - 1].quality : plan[i].width < plan[i - 1].width);
  }
  // Sizes stop at 1000px on the long side: ID numbers stay legible.
  assert.ok(plan.every((a) => Math.max(a.width, a.height) >= 1000));
});

test("shrinkPlan: a small image is tried once at its own size, never enlarged", () => {
  const plan = shrinkPlan(900, 600);
  assert.ok(plan.length >= 1);
  assert.ok(plan.every((a) => a.width === 900 && a.height === 600));
});

// A fake encoder: bytes ~ pixels x quality, like JPEG roughly does.
const fake = (a: { width: number; height: number; quality: number }) => Promise.resolve({ size: Math.round(a.width * a.height * a.quality * 0.6) });

test("shrinkWith: a 12 MP phone photo ends under the 500 KB target", async () => {
  const r = await shrinkWith(4032, 3024, fake);
  assert.equal(r.underTarget, true);
  assert.ok(r.result.size <= SHRINK_TARGET_BYTES, `${r.result.size}`);
  assert.ok(Math.max(r.attempt.width, r.attempt.height) <= SHRINK_MAX_PX);
});

test("shrinkWith: stops at the first attempt that fits (best quality that fits)", async () => {
  const seen: number[] = [];
  const r = await shrinkWith(1500, 1000, (a) => { seen.push(a.quality); return fake(a); }, 10_000_000);
  assert.equal(seen.length, 1);
  assert.equal(r.attempt.quality, 0.85);
});

test("shrinkWith: when nothing fits it returns the smallest try and says so", async () => {
  const r = await shrinkWith(4032, 3024, () => Promise.resolve({ size: 9_000_000 }), 1000);
  assert.equal(r.underTarget, false);
  const sizes: number[] = [];
  const small = await shrinkWith(4032, 3024, (a) => { const s = a.width * a.quality; sizes.push(s); return Promise.resolve({ size: s }); }, 1);
  assert.equal(small.result.size, Math.min(...sizes));
});
