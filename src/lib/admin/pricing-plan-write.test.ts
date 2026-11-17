import assert from "node:assert/strict";
import { test } from "node:test";

import { writePlan, type PlanRow, type PlanStore } from "./pricing-plan-write.ts";

type Row = PlanRow & { priceHourlyMinor: number };

const T0 = new Date("2026-11-01T00:00:00Z");
const NOW = new Date("2026-11-17T09:00:00Z");

function seed(): Row[] {
  const mk = (id: string, slug: string, currency: string, featured: boolean, at: Date, hourly: number): Row => ({
    id, slug, displayName: slug[0].toUpperCase() + slug.slice(1), currency, isFeatured: featured, updatedAt: at,
    features: ["Who", "6-8/10", "What"], priceHourlyMinor: hourly,
  });
  return [
    mk("inr-esp", "espresso", "INR", false, T0, 50000),
    mk("inr-cap", "cappuccino", "INR", true, T0, 10000),
    mk("inr-lat", "latte", "INR", false, T0, 20000),
    mk("usd-esp", "espresso", "USD", false, T0, 500),
    mk("usd-cap", "cappuccino", "USD", true, T0, 100),
    mk("usd-lat", "latte", "USD", false, T0, 200),
  ];
}

/** In-memory PlanStore. `lock()` is a real mutex held until `done()`, like an advisory xact lock; every call yields so concurrent writers can interleave. */
function fakeDb(rows: Row[]) {
  let tail: Promise<void> = Promise.resolve();
  const tick = () => new Promise<void>((r) => setImmediate(r));
  const log: string[] = [];
  const run = async <T>(fn: (store: PlanStore) => Promise<T>): Promise<T> => {
    let release!: () => void;
    let locked = false;
    const store: PlanStore = {
      async lock() {
        const prev = tail;
        tail = new Promise<void>((r) => (release = r));
        await prev;
        locked = true;
        log.push("lock");
      },
      async getPlan(id) {
        await tick();
        const r = rows.find((x) => x.id === id);
        return r ? { ...r } : undefined;
      },
      async updatePlan(id, set) {
        await tick();
        log.push(`update ${id}`);
        Object.assign(rows.find((x) => x.id === id)!, set);
      },
      async updateUsdBySlug(slug, set) {
        await tick();
        for (const r of rows) if (r.currency === "USD" && r.slug === slug) Object.assign(r, set);
      },
      async listInr() {
        await tick();
        return rows.filter((r) => r.currency.toUpperCase() === "INR").map((r) => ({ ...r }));
      },
      async unfeatureInr(ids, at) {
        await tick();
        for (const r of rows) if (ids.includes(r.id)) Object.assign(r, { isFeatured: false, updatedAt: at });
      },
      async syncUsdFeatured(slug, at) {
        await tick();
        for (const r of rows) if (r.currency === "USD" && r.isFeatured !== (r.slug === slug)) Object.assign(r, { isFeatured: r.slug === slug, updatedAt: at });
      },
    };
    try {
      return await fn(store);
    } finally {
      if (locked) release();
    }
  };
  return { run, log };
}

const featured = (rows: Row[], currency: string) => rows.filter((r) => r.currency === currency && r.isFeatured).map((r) => r.id);

test("featuring a plan un-features every other INR plan, and mirrors the choice onto the USD rows", async () => {
  const rows = seed();
  const db = fakeDb(rows);
  const r = await db.run((s) => writePlan(s, "inr-lat", { isFeatured: true }, NOW));
  assert.equal(r.ok, true);
  assert.deepEqual(featured(rows, "INR"), ["inr-lat"]);
  assert.deepEqual(featured(rows, "USD"), ["usd-lat"]);
  assert.deepEqual(r.ok && r.unfeatured.map((p) => p.id), ["inr-cap"]);
});

test("un-featuring the flagged plan leaves none flagged, and un-flags its USD twin", async () => {
  const rows = seed();
  const r = await fakeDb(rows).run((s) => writePlan(s, "inr-cap", { isFeatured: false }, NOW));
  assert.equal(r.ok, true);
  assert.deepEqual(featured(rows, "INR"), []);
  assert.deepEqual(featured(rows, "USD"), []);
});

test("a save that does not touch the flag leaves the single winner alone", async () => {
  const rows = seed();
  const r = await fakeDb(rows).run((s) => writePlan(s, "inr-lat", { priceHourlyMinor: 25000 }, NOW));
  assert.equal(r.ok, true);
  assert.deepEqual(featured(rows, "INR"), ["inr-cap"]);
  assert.equal(rows.find((x) => x.id === "inr-lat")!.priceHourlyMinor, 25000);
  assert.equal(rows.find((x) => x.id === "usd-lat")!.priceHourlyMinor, 250, "USD mirror at 100 paise = 1 cent");
});

test("existing duplicates self-heal on any save: the most recently updated flagged plan stays", async () => {
  const rows = seed();
  rows.find((x) => x.id === "inr-lat")!.isFeatured = true; // two flagged
  rows.find((x) => x.id === "inr-lat")!.updatedAt = new Date("2026-11-10T00:00:00Z"); // newer than Cappuccino (T0)
  const r = await fakeDb(rows).run((s) => writePlan(s, "inr-esp", { displayName: "Espresso" }, NOW));
  assert.equal(r.ok, true);
  assert.deepEqual(featured(rows, "INR"), ["inr-lat"]);
  assert.deepEqual(featured(rows, "USD"), ["usd-lat"]);
  assert.deepEqual(r.ok && r.unfeatured.map((p) => p.id), ["inr-cap"]);
});

test("two plans featured at the same moment: serialised, exactly one flagged at the end", async () => {
  for (let i = 0; i < 20; i++) {
    const rows = seed();
    const db = fakeDb(rows);
    await Promise.all([
      db.run((s) => writePlan(s, "inr-lat", { isFeatured: true }, new Date(NOW.getTime() + 1))),
      db.run((s) => writePlan(s, "inr-esp", { isFeatured: true }, new Date(NOW.getTime() + 2))),
    ]);
    assert.equal(featured(rows, "INR").length, 1, `run ${i}: INR ${featured(rows, "INR")}`);
    assert.equal(featured(rows, "USD").length, 1, `run ${i}: USD ${featured(rows, "USD")}`);
    // The twin of the INR winner is the USD one.
    const inrWinner = rows.find((r) => r.id === featured(rows, "INR")[0])!;
    assert.equal(rows.find((r) => r.id === featured(rows, "USD")[0])!.slug, inrWinner.slug);
  }
});

test("unknown id and non-INR rows are refused with 404 before any write", async () => {
  const rows = seed();
  const db = fakeDb(rows);
  const a = await db.run((s) => writePlan(s, "nope", { isFeatured: true }, NOW));
  const b = await db.run((s) => writePlan(s, "usd-lat", { isFeatured: true }, NOW));
  assert.deepEqual([a.ok, !a.ok && a.status], [false, 404]);
  assert.deepEqual([b.ok, !b.ok && b.status], [false, 404]);
  assert.deepEqual(db.log.filter((l) => l.startsWith("update")), []);
  assert.deepEqual(featured(rows, "INR"), ["inr-cap"]);
});

test("rewording the Findtern Score row so legacy cannot read it is refused (DB-26), writing nothing", async () => {
  const rows = seed();
  const db = fakeDb(rows);
  const r = await db.run((s) => writePlan(s, "inr-cap", { features: ["Who", "banana", "What"] }, NOW));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 400);
  assert.deepEqual(db.log.filter((l) => l.startsWith("update")), []);
});

test("the returned plan is the row as it was before the write (for the audit diff)", async () => {
  const rows = seed();
  const r = await fakeDb(rows).run((s) => writePlan(s, "inr-cap", { priceHourlyMinor: 12000 }, NOW));
  assert.equal(r.ok && r.before.priceHourlyMinor, 10000);
});
