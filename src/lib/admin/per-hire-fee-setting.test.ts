import assert from "node:assert/strict";
import { test } from "node:test";

import { isPerHireFeeBody, perHireFeeAuditMeta, perHireFeeBodySchema } from "./per-hire-fee-setting.ts";

const ok = { perHireFeeBands: { standard: true, skilled: false, assured: false } };

test("a full three-band body is accepted", () => {
  const r = perHireFeeBodySchema.safeParse(ok);
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.perHireFeeBands, ok.perHireFeeBands);
});

test("missing band, extra key, wrong types and empty bodies are refused with a readable message", () => {
  const bad: unknown[] = [
    { perHireFeeBands: { standard: true, skilled: false } },
    { perHireFeeBands: { ...ok.perHireFeeBands, platinum: true } },
    { perHireFeeBands: { standard: "true", skilled: false, assured: false } },
    { perHireFeeBands: { standard: 1, skilled: false, assured: false } },
    { perHireFeeBands: null },
    { perHireFeeBands: [] },
    { perHireFeeBands: {} },
    { perHireFeeBands: ok.perHireFeeBands, internActivationFeeMinor: 5 },
    {},
    null,
    [],
    "x",
  ];
  for (const body of bad) {
    const r = perHireFeeBodySchema.safeParse(body);
    assert.equal(r.success, false, JSON.stringify(body));
    if (!r.success) assert.ok((r.error.issues[0]?.message ?? "").length > 0);
  }
  const r = perHireFeeBodySchema.safeParse({ perHireFeeBands: { standard: true, skilled: "no", assured: false } });
  assert.ok(!r.success && /Cappuccino/.test(r.error.issues[0].message));
});

test("the route picks this schema only for the per-band body", () => {
  assert.equal(isPerHireFeeBody(ok), true);
  assert.equal(isPerHireFeeBody({ perHireFeeBands: null }), true);
  assert.equal(isPerHireFeeBody({ internActivationFeeMinor: 249900 }), false);
  assert.equal(isPerHireFeeBody(null), false);
  assert.equal(isPerHireFeeBody([]), false);
});

test("audit meta lists the plans that changed with before and after", () => {
  const from = { standard: true, skilled: false, assured: false };
  const to = { standard: true, skilled: true, assured: false };
  assert.deepEqual(perHireFeeAuditMeta(from, to), { value: { from, to }, changed: ["Cappuccino"] });
  assert.deepEqual(perHireFeeAuditMeta(from, from).changed, []);
  assert.deepEqual(perHireFeeAuditMeta(from, { standard: false, skilled: false, assured: true }).changed, ["Espresso", "Latte"]);
});
