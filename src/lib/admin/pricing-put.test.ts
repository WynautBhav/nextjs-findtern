import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { allows, canWrite, requiredPermissions } from "./permissions.ts";
import { PRICING_REVALIDATE, activationFeeAuditMeta, parsePricingPut, stipendSaveAuditMeta } from "./pricing-put.ts";

const stipend = (b: Record<string, unknown>) => ({ internStipendBands: b });
const ok = { standard: null, skilled: 800000, assured: 1500000 };

test("a full stipend body is dispatched as the stipend, in paise", () => {
  assert.deepEqual(parsePricingPut(stipend(ok)), { kind: "stipend", bands: ok });
  // The editor sends integer rupees x 100; zero is a valid stipend.
  assert.equal(parsePricingPut(stipend({ ...ok, skilled: 0 })).kind, "stipend");
});

test("bad stipend bodies are refused with a message, never dispatched", () => {
  const bad: [string, unknown][] = [
    ["negative", stipend({ ...ok, skilled: -100 })],
    ["fractional paise", stipend({ ...ok, assured: 1500000.5 })],
    ["string amount", stipend({ ...ok, assured: "15000" })],
    ["above the cap", stipend({ ...ok, assured: 100_000_001 })],
    ["Espresso number", stipend({ ...ok, standard: 500000 })],
    ["Espresso zero", stipend({ ...ok, standard: 0 })],
    ["Espresso missing", stipend({ skilled: 1, assured: 2 })],
    ["unknown band", stipend({ ...ok, platinum: 1 })],
    ["null bands", { internStipendBands: null }],
  ];
  for (const [what, body] of bad) {
    const r = parsePricingPut(body);
    assert.equal(r.kind, "invalid", what);
    assert.ok(r.kind === "invalid" && r.error.length > 0, `${what}: has a message`);
  }
  assert.match((parsePricingPut(stipend({ ...ok, standard: 1 })) as { error: string }).error, /Espresso/);
});

test("Cappuccino above Latte is allowed: the validator has no ordering rule", () => {
  assert.equal(parsePricingPut(stipend({ standard: null, skilled: 2000000, assured: 1000000 })).kind, "stipend");
});

test("the other two bodies still dispatch as before", () => {
  assert.deepEqual(parsePricingPut({ internActivationFeeMinor: 249900 }), { kind: "activationFee", feeMinor: 249900 });
  const bands = { standard: true, skilled: false, assured: false };
  assert.deepEqual(parsePricingPut({ perHireFeeBands: bands }), { kind: "perHireFee", bands });
  for (const body of [{ internActivationFeeMinor: 0 }, { internActivationFeeMinor: 1.5 }, { internActivationFeeMinor: -1 }, {}, null, [], { perHireFeeBands: { standard: true } }]) {
    assert.equal(parsePricingPut(body).kind, "invalid", JSON.stringify(body));
  }
  // The stipend key wins over a stray fee key: it is never half-applied as a fee.
  assert.equal(parsePricingPut({ ...stipend(ok), internActivationFeeMinor: 1 }).kind, "invalid");
});

test("one audit meta per save carries {from,to} for each changed field", () => {
  const meta = stipendSaveAuditMeta(ok, { ...ok, assured: 1600000 });
  assert.deepEqual(meta.changes, { "assured.stipendInrMinor": { from: 1500000, to: 1600000 } });
  assert.deepEqual(meta.changed, ["Latte"]);
  assert.deepEqual(meta.value, { from: ok, to: { ...ok, assured: 1600000 } });
  assert.deepEqual(stipendSaveAuditMeta(ok, ok).changes, {});

  assert.deepEqual(activationFeeAuditMeta(249900, 300000).changes, { activationFeeInrMinor: { from: 249900, to: 300000 } });
  assert.deepEqual(activationFeeAuditMeta(249900, 300000).value, { from: 249900, to: 300000 });
});

test("every pricing write needs Accounts (transactions:write): a content role (cms:write) or a reader is refused, super admin passes", () => {
  // requireMutation refuses (403 "Your role doesn't allow this") when allows(...) is false for the route's rule.
  for (const method of ["PUT", "PATCH", "POST"]) {
    const needed = requiredPermissions("/api/admin/pricing", method);
    assert.deepEqual(needed, ["transactions:write"], method);
    assert.equal(allows(["transactions:write"], needed), true, `${method} Accounts`);
    assert.equal(allows(["*"], needed), true, `${method} super admin`);
    assert.equal(allows(["cms:read", "cms:write"], needed), false, `${method} content role gets 403`);
    assert.equal(allows(["cms:read", "transactions:read"], needed), false, `${method} reader gets 403`);
    assert.equal(allows(["interns:write"], needed), false, `${method} other staff get 403`);
    assert.equal(allows(undefined, needed), false, `${method} no permissions`);
  }
  assert.equal(canWrite(["cms:write"], "/api/admin/pricing"), false);
  // Reading the rate card stays a content permission.
  assert.equal(allows(["cms:read"], requiredPermissions("/api/admin/pricing", "GET")), true);
});

test("the route runs the guard first, keeps the admin role, and every write purges the pricing pages", () => {
  const route = readFileSync(new URL("../../app/api/admin/pricing/route.ts", import.meta.url), "utf8");
  const handlers = route.split(/^export async function /m).slice(1);
  assert.deepEqual(handlers.map((h) => h.split("(")[0]), ["PATCH", "PUT", "POST"]);
  for (const h of handlers) {
    const name = h.split("(")[0];
    assert.match(h, /requireMutation\(\{ req, roles: \["admin"\] \}\)/, `${name}: admin role`);
    assert.ok(h.indexOf("requireMutation(") < h.indexOf("req.json()") || !h.includes("req.json()"), `${name}: guard before body`);
    assert.ok(h.includes("revalidatePricing()"), `${name}: purges the pricing pages`);
  }
  // PUT has five writers (Findtern Pro subscription, per-hire, upfront discount, stipend, activation fee), each followed by its own purge.
  const put = handlers[1];
  assert.equal(put.match(/revalidatePricing\(\)/g)?.length, 5);
  assert.equal(put.match(/setSetting\(/g)?.length, 5);
  assert.equal(put.match(/recordAdminAudit\(/g)?.length, 5, "one audit row per save");
  // The subscription price is money: it also needs the Accounts permission, checked before anything is written.
  assert.ok(put.indexOf('allows(guard.session.permissions, ["transactions:write"])') < put.indexOf('setSetting("employer_subscription"'));
  // The purge covers the layout and /llms.txt.
  assert.deepEqual(PRICING_REVALIDATE, [{ path: "/", type: "layout" }, { path: "/llms.txt" }]);
});

test("a Findtern Pro body is routed to the subscription writer and validated there", () => {
  assert.deepEqual(parsePricingPut({ employerSubscription: { priceInrMinor: 1_000_000, durationDays: 365, enabled: true } }), { kind: "subscription", config: { priceInrMinor: 1_000_000, durationDays: 365, enabled: true } });
  const bad = parsePricingPut({ employerSubscription: { priceInrMinor: 0, durationDays: 365, enabled: true } });
  assert.equal(bad.kind, "invalid");
  assert.equal(parsePricingPut({ employerSubscription: { priceInrMinor: 1_000_000, durationDays: 2000, enabled: true } }).kind, "invalid");
  // The other three bodies still route as before.
  assert.equal(parsePricingPut({ internActivationFeeMinor: 49900 }).kind, "activationFee");
});
