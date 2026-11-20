import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { adjustedBadge, getPicks, getShortlistOverride, resetPicksStore, seedPicks, setPicks, setShortlistOverride, shortlistSnapshot, subscribePicks, subscribeShortlist, togglePick } from "./candidate-picks-store.ts";

const read = (p: string) => readFileSync(join(import.meta.dirname, "..", p), "utf8");

test("picks: seed, toggle, never more than four, listeners fire once per real change", () => {
  resetPicksStore();
  let calls = 0;
  const off = subscribePicks(() => calls++);
  seedPicks("p1", ["a", "b"]);
  seedPicks("p1", ["a", "b"]); // same: no change, no render
  assert.equal(calls, 1);
  assert.equal(togglePick("c"), true);
  assert.equal(togglePick("d"), true);
  assert.equal(togglePick("e"), false, "a fifth pick is refused");
  assert.deepEqual(getPicks().ids, ["a", "b", "c", "d"]);
  assert.equal(togglePick("B"), true, "unticking is case-insensitive like the cookie ids");
  assert.deepEqual(getPicks().ids, ["a", "c", "d"]);
  setPicks([]);
  assert.deepEqual(getPicks(), { project: "p1", ids: [] });
  off();
  setPicks(["x"]);
  assert.equal(calls, 5, "unsubscribed: no more calls");
});

test("star override: set, roll back, snapshot moves only on a change", () => {
  resetPicksStore();
  let calls = 0;
  const off = subscribeShortlist(() => calls++);
  const v0 = shortlistSnapshot();
  assert.equal(getShortlistOverride("p", "i"), undefined);
  setShortlistOverride("p", "i", true);
  assert.equal(getShortlistOverride("p", "i"), true);
  assert.notEqual(shortlistSnapshot(), v0);
  setShortlistOverride("p", "i", true); // same: nothing
  assert.equal(calls, 1);
  setShortlistOverride("p", "i", undefined); // rollback to what the results say
  assert.equal(getShortlistOverride("p", "i"), undefined);
  setShortlistOverride("p", "i", undefined);
  assert.equal(calls, 2);
  assert.equal(getShortlistOverride("q", "i"), undefined, "per project");
  off();
});

test("nav badge arithmetic: +1/-1, never below zero, 99+ stays", () => {
  assert.equal(adjustedBadge(undefined, 1), 1);
  assert.equal(adjustedBadge(3, -1), 2);
  assert.equal(adjustedBadge(1, -1), undefined, "no badge at zero");
  assert.equal(adjustedBadge(0, -2), undefined);
  assert.equal(adjustedBadge("99+", -1), "99+");
  assert.equal(adjustedBadge(99, 1), "99+");
});

test("stars and compare ticks never re-render the page: no router.refresh in the card, the two toggles or the shell badge", () => {
  for (const file of ["components/employer/candidate-card.tsx", "components/employer/shortlist-toggle.tsx", "components/employer/compare-toggle.tsx", "app/employer/candidates/_app.tsx"]) {
    assert.doesNotMatch(read(file), /router\.refresh\(/, file);
  }
  const card = read("components/employer/candidate-card.tsx");
  assert.match(card, /invalidateQueries\(CANDIDATES_RESULTS_ENDPOINT\)/);
  assert.match(card, /announceShortlist/);
  assert.match(card, /set\(undefined\)/, "rolls back on error");
  assert.match(read("components/layout/console-shell.tsx"), /SHORTLIST_EVENT/);
});

test("the Candidates region: one hook, no per-change navigation, panel not re-keyed on its own change", () => {
  const app = read("app/employer/candidates/_app.tsx");
  assert.match(app, /useInstantQuery<ResultsWire>/);
  assert.match(app, /<ResultsRegion/);
  assert.match(app, /updateKey=\{q\.qs\}/);
  assert.doesNotMatch(app, /useProgressRouter|router\.refresh/);
  const filters = read("app/employer/candidates/_filters.tsx");
  assert.doesNotMatch(filters, /key=\{queryOf/);
  assert.match(filters, /key=\{panelEpoch\}/);
  // The in-page links do not prefetch the whole page.
  assert.match(read("app/employer/candidates/_link.tsx"), /prefetch = false/);
});
