import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { allows, canWrite, requiredPermissions } from "./permissions.ts";

/**
 * Admin create of a full-waiver promo code, traced through the REAL route handler with the in-memory database
 * (test-support/route-fakes.mjs). Proves: the caps (1-25 uses, expiry within 30 days, audience chosen) are enforced
 * by the server whatever the form sends, the row is stored as a full waiver, and the audit row never holds the code
 * text. Cannot prove the SQL (the browser pass does).
 */
type Route = { POST: (r: Request) => Promise<{ status: number; body: Record<string, any> }> }; // eslint-disable-line @typescript-eslint/no-explicit-any

register("./test-support/route-hooks.mjs", import.meta.url);
const fakes = (await import("./test-support/route-fakes.mjs")) as unknown as { reset: () => void };
const route = (await import("../../app/api/admin/promo-codes/full-waiver/route.ts")) as unknown as Route;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F = () => (globalThis as any).__fake;
const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();
const post = (body: unknown) => route.POST(new Request("https://example.test/api/admin/promo-codes/full-waiver", { method: "POST", body: JSON.stringify(body) }));

/** The select for a clashing code finds nothing; the insert returns the row it was given (what Postgres' RETURNING does). */
function setup() {
  fakes.reset();
  F().queue = [[]]; // clash lookup
  F().echoInsert = true;
}

test("a valid request creates a full-waiver row, with a generated FREE- code when none is typed", async () => {
  setup();
  const res = await post({ appliesTo: "employer", maxUsages: 3, validUntil: inDays(5) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const row = F().inserts[0];
  assert.equal(row.discountType, "full_waiver");
  assert.equal(row.discountValue, 100);
  assert.equal(row.appliesTo, "employer");
  assert.equal(row.maxUsages, 3);
  assert.equal(row.isActive, true);
  assert.match(row.code, /^FREE-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

test("defaults: 1 use and an expiry 7 days out when the form sends neither", async () => {
  setup();
  const res = await post({ appliesTo: "both" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const row = F().inserts[0];
  assert.equal(row.maxUsages, 1);
  const days = (row.validUntil.getTime() - Date.now()) / DAY;
  assert.ok(days > 6.99 && days <= 7.001, `expiry is ${days} days out`);
});

test("an admin may type a custom code, upper-cased and format-checked", async () => {
  setup();
  const res = await post({ appliesTo: "intern", code: "free-launch-test", maxUsages: 2 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(F().inserts[0].code, "FREE-LAUNCH-TEST");
  setup();
  assert.equal((await post({ appliesTo: "intern", code: "bad code!" })).status, 400);
});

test("the caps are enforced on the server: 26 uses, 31 days, no expiry, past expiry, no audience are all refused, and nothing is written", async () => {
  for (const [name, body] of [
    ["26 uses", { appliesTo: "employer", maxUsages: 26 }],
    ["0 uses", { appliesTo: "employer", maxUsages: 0 }],
    ["unlimited uses", { appliesTo: "employer", maxUsages: null }],
    ["31 days", { appliesTo: "employer", validUntil: inDays(31) }],
    ["no expiry", { appliesTo: "employer", validUntil: null }],
    ["expired", { appliesTo: "employer", validUntil: inDays(-1) }],
    ["no audience", { maxUsages: 1 }],
    ["bad audience", { appliesTo: "college" }],
  ] as const) {
    setup();
    const res = await post(body);
    assert.equal(res.status, 400, `${name}: ${JSON.stringify(res.body)}`);
    assert.equal(F().inserts.length, 0, `${name}: wrote a row`);
  }
});

test("a code that already exists is refused (409), nothing written", async () => {
  setup();
  F().queue = [[{ id: "p-existing" }]];
  const res = await post({ appliesTo: "employer", code: "FREE-TAKEN" });
  assert.equal(res.status, 409);
  assert.equal(F().inserts.length, 0);
});

test("the audit row has a distinct action, the code id and last 4 characters, never the code text", async () => {
  setup();
  const res = await post({ appliesTo: "employer", maxUsages: 2, validUntil: inDays(3) });
  assert.equal(res.status, 201);
  const audit = F().inserts.find((r: { action?: string }) => r.action === "promo.full_waiver_created");
  assert.ok(audit, "an audit row is written");
  assert.equal(audit.targetType, "promo_code");
  const code = F().inserts[0].code as string;
  assert.ok(!JSON.stringify(audit).includes(code), "the audit row must not hold the code text");
  assert.equal(audit.meta.codeTail, code.slice(-4));
  assert.equal(audit.meta.appliesTo, "employer");
  assert.equal(audit.meta.maxUsages, 2);
  const out = JSON.stringify(res.body);
  assert.ok(out.includes(code), "the admin is shown the code once, in the response");
});

// ---- who may call it

test("creating a full waiver needs the finance write permission (transactions:write), a finer gate than the other promo writes", () => {
  const path = "/api/admin/promo-codes/full-waiver";
  const need = requiredPermissions(path, "POST");
  assert.deepEqual(need, ["transactions:write"]);
  assert.equal(allows(["transactions:write"], need), true);
  assert.equal(allows(["cms:write"], need), false, "cms:write may edit ordinary promo codes but not mint a waiver");
  assert.equal(allows(["transactions:read"], need), false);
  assert.equal(allows(["*"], need), true);
  assert.equal(canWrite(["cms:write"], path), false);
  assert.equal(canWrite(["cms:write"], "/api/admin/promo-codes"), true, "ordinary promo writes are unchanged");
});
