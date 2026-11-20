import { test } from "node:test";
import assert from "node:assert/strict";

import { homeTopLayout } from "./home-layout.ts";

const T = true;
const F = false;

test("nothing to show: no band", () => {
  assert.equal(homeTopLayout({ waiting: F, nextUp: F, chart: F }), null);
});

test("no chart: a pair shares the row, a single card takes it whole", () => {
  assert.match(homeTopLayout({ waiting: T, nextUp: T, chart: F })!.root, /@xl:grid-cols-2/);
  for (const c of [{ waiting: T, nextUp: F, chart: F }, { waiting: F, nextUp: T, chart: F }]) {
    const l = homeTopLayout(c)!;
    assert.doesNotMatch(l.root, /grid-cols-2/);
  }
});

test("only What next, alone and wide: buttons need not stretch", () => {
  assert.equal(homeTopLayout({ waiting: T, nextUp: F, chart: F })!.wide, true);
  assert.equal(homeTopLayout({ waiting: T, nextUp: T, chart: F })!.wide, false);
  assert.equal(homeTopLayout({ waiting: T, nextUp: F, chart: T })!.wide, false);
});

test("chart only: one column, no spans", () => {
  const l = homeTopLayout({ waiting: F, nextUp: F, chart: T })!;
  assert.equal(l.root, "grid gap-4");
  assert.equal(l.chart, "");
});

test("all three: What next beside the chart, Next up a strip across the row below", () => {
  const l = homeTopLayout({ waiting: T, nextUp: T, chart: T })!;
  assert.match(l.waiting, /@4xl:row-start-1/);
  assert.match(l.chart, /@4xl:row-start-1/);
  assert.match(l.nextUp, /@4xl:col-span-2/);
  assert.match(l.nextUp, /@4xl:row-start-2/);
  assert.match(l.chart, /@xl:col-span-2/);
  assert.equal(l.nextUpStrip, true);
  assert.equal(homeTopLayout({ waiting: F, nextUp: T, chart: T })!.nextUpStrip, false);
});

test("chart with one left card: the pair row is the card's alone, never half a row", () => {
  for (const c of [{ waiting: T, nextUp: F, chart: T }, { waiting: F, nextUp: T, chart: T }]) {
    const l = homeTopLayout(c)!;
    assert.match(l.waiting, /@xl:col-span-2/);
    assert.match(l.nextUp, /@xl:col-span-2/);
    assert.match(l.chart, /@xl:col-span-2/);
  }
});
