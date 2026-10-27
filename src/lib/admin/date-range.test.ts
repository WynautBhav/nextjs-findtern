import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDateRange } from "./date-range.ts";

test("custom range: from inclusive, to inclusive (next midnight exclusive)", () => {
  const r = parseDateRange({ from: "2026-08-01", to: "2026-08-31" });
  assert.equal(r.from?.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(r.toExclusive?.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("open bounds and junk are ignored", () => {
  assert.deepEqual(parseDateRange({}), { from: null, toExclusive: null });
  assert.equal(parseDateRange({ from: "31/08/2026" }).from, null);
  assert.equal(parseDateRange({ to: "2026-13-45" }).toExclusive, null);
  assert.equal(parseDateRange({ to: "2026-08-31" }).from, null);
});
