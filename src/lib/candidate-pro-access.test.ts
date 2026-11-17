import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

/**
 * Server-side enforcement of the Findtern Pro candidate filters. The real `employerSubscription` runs on an
 * in-memory database (the subscription rows and the platform settings), then `enforcePro` narrows a pool.
 * A stale or hand-edited URL from a free or lapsed employer must neither filter nor sort.
 */

register("./admin/test-support/sem-hooks.mjs", import.meta.url);
const fakes = (await import("./admin/test-support/sem-fakes.mjs")) as typeof import("./admin/test-support/sem-fakes.mjs");
const { proAccess, enforcePro, proRequestOf, EMPTY_PRO_REQUEST } = await import("./candidate-pro-access.ts");
const { employerSubscription } = await import("./subscription/entitlement-db.ts");

type Fake = { rows: Record<string, unknown>; dbDown: boolean; noDb: boolean; failSelect: string | null };
const sem = () => (globalThis as unknown as { __sem: Fake }).__sem;
beforeEach(() => fakes.reset());

const DAY = 86_400_000;
const NOW = new Date("2026-11-17T10:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const sub = (paidAt: Date, periodDays = 365) => ({ status: "paid", paidAt, raw: { kind: "employer_subscription", periodDays } });
const settings = (config?: unknown) => {
  sem().rows.platform_settings = (n: number) => (n % 2 === 0 && config !== undefined ? [{ value: config }] : []);
};

type P = { id: string; college: string | null; cgpa: number | null; verified?: boolean; pct?: boolean };
const pool: P[] = [
  { id: "a", college: "Zeta Institute", cgpa: 9.2, verified: true },
  { id: "b", college: "Alpha College", cgpa: 7.1, pct: true },
  { id: "c", college: "Alpha College", cgpa: null },
  { id: "d", college: "Mid University", cgpa: 8.4, verified: true },
  { id: "e", college: null, cgpa: 5.0 },
];
const factsOf = (p: P) => ({ cgpa: p.cgpa, approx: p.pct === true, verified: p.verified === true, college: p.college });
const ids = (xs: P[]) => xs.map((x) => x.id);

const wanted = proRequestOf({ cgpaMin: "8", colleges: ["Alpha College", "Mid University"] });
const sorted = proRequestOf({ sort: "college" });

/* ── proAccess: who may use the filters ─────────────────────────────────────────────────────────── */

test("a paid, current subscription has access", async () => {
  sem().rows.employer_payments = [sub(ago(10))];
  assert.equal(await proAccess("emp-1", (id) => employerSubscription(id, NOW)), true);
});

test("no subscription, no access", async () => {
  assert.equal(await proAccess("emp-1", (id) => employerSubscription(id, NOW)), false);
});

test("an expired subscription has no access", async () => {
  sem().rows.employer_payments = [sub(ago(400))];
  assert.equal(await proAccess("emp-1", (id) => employerSubscription(id, NOW)), false);
});

test("the feature switched off (enabled = false) gives nobody access, even with a paid row", async () => {
  sem().rows.employer_payments = [sub(ago(10))];
  settings({ enabled: false });
  assert.equal(await proAccess("emp-1", (id) => employerSubscription(id, NOW)), false);
});

test("a lookup that throws, rejects or answers nonsense is no access (fail closed)", async () => {
  assert.equal(await proAccess("emp-1", async () => { throw new Error("db down"); }), false);
  assert.equal(await proAccess("emp-1", () => { throw new Error("sync throw"); }), false);
  assert.equal(await proAccess("emp-1", async () => undefined as never), false);
  assert.equal(await proAccess("emp-1", async () => ({ active: "yes" }) as never), false);
  assert.equal(await proAccess("", async () => ({ active: true, status: "active", endsAt: null, daysLeft: 1 })), false);
});

test("the real lookup failing (database unreachable, a failing select) is no access", async () => {
  sem().rows.employer_payments = [sub(ago(10))];
  sem().dbDown = true;
  assert.equal(await proAccess("emp-1"), false);
  fakes.reset();
  sem().rows.employer_payments = [sub(ago(10))];
  sem().failSelect = "employer_payments";
  assert.equal(await proAccess("emp-1"), false);
  fakes.reset();
  sem().noDb = true;
  assert.equal(await proAccess("emp-1"), false);
});

/* ── enforcePro: the same pool, with and without access ─────────────────────────────────────────── */

test("a subscriber's filters narrow the pool, and the college order applies", () => {
  const r = enforcePro(pool, wanted, true, factsOf);
  assert.deepEqual(ids(r.items), ["d"]);
  assert.equal(r.ignored, false);
  assert.equal(r.hiddenNoScore, 1);
  const s = enforcePro(pool, sorted, true, factsOf);
  assert.deepEqual(ids(s.items), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(ids(s.order(s.items)), ["b", "c", "d", "a", "e"]);
});

test("without access the same request changes nothing: no filtering, no sorting, no options, no counts", () => {
  const r = enforcePro(pool, wanted, false, factsOf);
  assert.deepEqual(ids(r.items), ids(pool));
  assert.deepEqual(r.applied, EMPTY_PRO_REQUEST);
  assert.equal(r.ignored, true);
  assert.deepEqual(r.options, []);
  assert.equal(r.hiddenNoScore, 0);
  assert.equal(r.approxKept, 0);
  const s = enforcePro(pool, sorted, false, factsOf);
  assert.deepEqual(ids(s.order(s.items)), ids(pool), "college sort ignored");
  assert.equal(s.ignored, true);
});

test("without access each locked parameter alone is ignored", () => {
  for (const raw of [{ cgpaMin: "9" }, { cgpaVerified: "1" }, { colleges: "Nowhere" }, { sort: "college_desc" }, { sort: "coding,college" }]) {
    const r = enforcePro(pool, proRequestOf(raw), false, factsOf);
    assert.deepEqual(ids(r.order(r.items)), ids(pool), JSON.stringify(raw));
    assert.equal(r.ignored, true, JSON.stringify(raw));
  }
});

test("a request with nothing locked in it is not 'ignored' (no notice for a plain visit)", () => {
  const r = enforcePro(pool, proRequestOf({ sort: "coding", cgpaMin: "0", colleges: ["", "  "] }), false, factsOf);
  assert.equal(r.ignored, false);
  assert.deepEqual(r.applied, EMPTY_PRO_REQUEST);
});

test("an expired subscriber's stale link, end to end through the real lookup, filters nothing", async () => {
  sem().rows.employer_payments = [sub(ago(500))];
  const active = await proAccess("emp-1", (id) => employerSubscription(id, NOW));
  const r = enforcePro(pool, wanted, active, factsOf);
  assert.equal(r.items.length, pool.length);
  assert.equal(r.ignored, true);
});

test("a current subscriber through the real lookup is narrowed; the same employer with the feature off is not", async () => {
  sem().rows.employer_payments = [sub(ago(5))];
  assert.deepEqual(ids(enforcePro(pool, wanted, await proAccess("emp-1", (id) => employerSubscription(id, NOW)), factsOf).items), ["d"]);
  settings({ enabled: false });
  assert.equal(enforcePro(pool, wanted, await proAccess("emp-1", (id) => employerSubscription(id, NOW)), factsOf).items.length, pool.length);
});

test("the options are only built for a subscriber, from the pool left by the CGPA filter", () => {
  const r = enforcePro(pool, proRequestOf({ cgpaMin: "8" }), true, factsOf);
  assert.deepEqual(r.options, [
    { name: "Mid University", count: 1 },
    { name: "Zeta Institute", count: 1 },
  ]);
});

/* ── proRequestOf: reading the URL ───────────────────────────────────────────────────────────────── */

test("proRequestOf reads and bounds the URL values", () => {
  assert.deepEqual(proRequestOf({}), EMPTY_PRO_REQUEST);
  assert.equal(proRequestOf({ cgpaMin: "7.84" }).cgpaMin, 7.8);
  assert.equal(proRequestOf({ cgpaMin: "99" }).cgpaMin, 10);
  for (const bad of ["-1", "abc", "NaN", "Infinity", ""]) assert.equal(proRequestOf({ cgpaMin: bad }).cgpaMin, 0, bad);
  assert.equal(proRequestOf({ cgpaMin: ["8.5", "2"] }).cgpaMin, 8.5);
  assert.equal(proRequestOf({ cgpaVerified: "1" }).cgpaVerified, true);
  assert.equal(proRequestOf({ cgpaVerified: ["0", "1"] }).cgpaVerified, true);
  assert.equal(proRequestOf({ cgpaVerified: "0" }).cgpaVerified, false);
  assert.equal(proRequestOf({ sort: ["coding", "college_desc"] }).collegeSort, "desc");
});
