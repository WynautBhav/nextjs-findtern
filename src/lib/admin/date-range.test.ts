import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDateRange } from "./date-range.ts";

test("custom range reads India days: from inclusive, to inclusive (next India midnight exclusive)", () => {
  const r = parseDateRange({ from: "2026-08-01", to: "2026-08-31" });
  // 1 Aug 00:00 IST is 31 Jul 18:30 UTC. UTC midnight made the screens drop 5.5 hours of the first day and keep 5.5 of the next.
  assert.equal(r.from?.toISOString(), "2026-07-31T18:30:00.000Z");
  assert.equal(r.toExclusive?.toISOString(), "2026-08-31T18:30:00.000Z");
});

test("a payment at 00:30 IST on the 17th is inside From=To=17th, one at 23:30 IST on the 16th is not", () => {
  const { from, toExclusive } = parseDateRange({ from: "2026-11-17", to: "2026-11-17" });
  const inside = new Date("2026-11-16T19:00:00Z"); // 17 Nov 00:30 IST
  const before = new Date("2026-11-16T18:00:00Z"); // 16 Nov 23:30 IST
  const next = new Date("2026-11-17T18:30:00Z"); // 18 Nov 00:00 IST
  assert.ok(inside >= from! && inside < toExclusive!);
  assert.ok(!(before >= from!));
  assert.ok(!(next < toExclusive!));
});

test("open bounds and junk are ignored", () => {
  assert.deepEqual(parseDateRange({}), { from: null, toExclusive: null });
  assert.equal(parseDateRange({ from: "31/08/2026" }).from, null);
  assert.equal(parseDateRange({ to: "2026-13-45" }).toExclusive, null);
  assert.equal(parseDateRange({ to: "2026-08-31" }).from, null);
});
