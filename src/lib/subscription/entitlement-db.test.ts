import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

/**
 * employerSubscription: the employer's entitlement from paid `employer_payments` rows with raw.kind =
 * "employer_subscription" plus the `platform_settings` config and overrides. In-memory database, no Next runtime.
 * Whatever goes wrong, the answer is "inactive": a page or a paywall never fails on it.
 */

register("../admin/test-support/sem-hooks.mjs", import.meta.url);
const fakes = (await import("../admin/test-support/sem-fakes.mjs")) as typeof import("../admin/test-support/sem-fakes.mjs");
const { employerSubscription } = await import("./entitlement-db.ts");

type Fake = { rows: Record<string, unknown>; calls: { op: string; table?: string }[]; dbDown: boolean; noDb: boolean; failSelect: string | null };
const sem = () => (globalThis as unknown as { __sem: Fake }).__sem;
beforeEach(() => fakes.reset());

const DAY = 86_400_000;
const NOW = new Date("2026-11-17T10:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY);
const sub = (paidAt: Date | null, over: Record<string, unknown> = {}, status = "paid") => ({ status, paidAt, raw: { kind: "employer_subscription", periodDays: 365, ...over } });
const INACTIVE = { active: false, status: "none", endsAt: null, daysLeft: null };

/** The two platform_settings reads, config first then overrides. */
const settings = (config?: unknown, overrides?: unknown) => {
  sem().rows.platform_settings = (n: number) => {
    const value = n === 0 ? config : overrides;
    return value === undefined ? [] : [{ value }];
  };
};

test("a paid subscription makes the employer active for the period", async () => {
  sem().rows.employer_payments = [sub(ago(10))];
  assert.deepEqual(await employerSubscription("emp-1", NOW), { active: true, status: "active", endsAt: ahead(355).toISOString(), daysLeft: 355 });
});

test("no payments and no settings: inactive, with the default config (on)", async () => {
  assert.deepEqual(await employerSubscription("emp-1", NOW), INACTIVE);
});

test("payments stack: paying while active extends from the current end", async () => {
  sem().rows.employer_payments = [sub(ago(200)), sub(ago(100))];
  assert.equal((await employerSubscription("emp-1", NOW)).endsAt, new Date(ago(200).getTime() + 730 * DAY).toISOString());
});

test("only this employer's override applies", async () => {
  const grant = { grantedUntil: ahead(40).toISOString(), by: "admin-1", note: "pilot" };
  settings(undefined, { "emp-2": grant });
  assert.deepEqual(await employerSubscription("emp-1", NOW), INACTIVE);
  settings(undefined, { "emp-1": grant });
  assert.deepEqual(await employerSubscription("emp-1", NOW), { active: true, status: "active", endsAt: ahead(40).toISOString(), daysLeft: 40 });
});

test("a revoke override voids earlier payments", async () => {
  sem().rows.employer_payments = [sub(ago(10))];
  settings(undefined, { "emp-1": { revokedAt: ago(2).toISOString(), by: "admin-1", note: "chargeback" } });
  assert.deepEqual(await employerSubscription("emp-1", NOW), { active: false, status: "revoked", endsAt: null, daysLeft: null });
});

test("enabled=false in the stored config: inactive whatever was paid", async () => {
  sem().rows.employer_payments = [sub(ago(10))];
  settings({ priceInrMinor: 1_000_000, durationDays: 365, enabled: false });
  assert.deepEqual(await employerSubscription("emp-1", NOW), INACTIVE);
});

test("the stored duration is the fallback for a payment with no periodDays", async () => {
  sem().rows.employer_payments = [{ status: "paid", paidAt: ago(10), raw: { kind: "employer_subscription" } }];
  settings({ durationDays: 100 });
  assert.equal((await employerSubscription("emp-1", NOW)).endsAt, ahead(90).toISOString());
});

test("rows that are not paid subscription orders are ignored even if the query returned them", async () => {
  sem().rows.employer_payments = [sub(ago(1), {}, "created"), { status: "paid", paidAt: ago(1), raw: { proposalIds: ["p1"] } }];
  assert.deepEqual(await employerSubscription("emp-1", NOW), INACTIVE);
});

test("the database is read for this employer's payments and for the two settings, and nothing is written", async () => {
  await employerSubscription("emp-1", NOW);
  const ops = sem().calls.map((c) => `${c.op}:${c.table}`).sort();
  assert.deepEqual(ops, ["select:employer_payments", "select:platform_settings", "select:platform_settings"]);
});

test("database unreachable: inactive, never throws", async () => {
  sem().dbDown = true;
  assert.deepEqual(await employerSubscription("emp-1", NOW), INACTIVE);
});

test("no DATABASE_URL: inactive, never throws", async () => {
  sem().noDb = true;
  assert.deepEqual(await employerSubscription("emp-1", NOW), INACTIVE);
});

test("the payments query failing: inactive, never throws", async () => {
  sem().failSelect = "employer_payments";
  assert.deepEqual(await employerSubscription("emp-1", NOW), INACTIVE);
});

test("the settings query failing does not hide a paid subscription (defaults apply)", async () => {
  sem().rows.employer_payments = [sub(ago(10))];
  sem().failSelect = "platform_settings";
  assert.equal((await employerSubscription("emp-1", NOW)).active, true);
});

test("garbled rows and settings: inactive, never throws", async () => {
  sem().rows.employer_payments = [null, undefined, "x", { status: "paid", paidAt: "2026-01-01", raw: { kind: "employer_subscription" } }];
  settings("junk", [1, 2, 3]);
  assert.deepEqual(await employerSubscription("emp-1", NOW), INACTIVE);
});

test("an empty employer id is inactive without a query", async () => {
  assert.deepEqual(await employerSubscription("", NOW), INACTIVE);
  assert.equal(sem().calls.length, 0);
});
