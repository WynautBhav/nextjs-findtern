import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const card = read("src/components/employer/candidate-card.tsx");
const grid = card.slice(card.indexOf('if (layout === "grid")'), card.indexOf("// The full-width card") > 0 ? card.indexOf("// The full-width card") : card.length);

test("grid card is its own card: edge, shadow, radius, clipped sections, hover and focus", () => {
  assert.match(grid, /rounded-2xl border bg-white shadow-sm/);
  assert.match(grid, /overflow-hidden/);
  assert.match(grid, /border-ink-300/, "a visible edge on the white page, not the ink-200 hairline");
  assert.match(grid, /hover:shadow-md/);
  assert.match(grid, /focus-within:ring-2/);
});

test("grid card is divided: header, body and footer, each with its own padding and a divider", () => {
  assert.match(grid, /border-b px-4 py-3\.5/, "header");
  assert.match(grid, /flex flex-1 flex-col gap-3 px-4 py-4/, "body");
  assert.match(grid, /border-t border-ink-300 bg-ink-50 px-4 py-3/, "footer");
});

test("grid card has a selected (compare) and a shortlisted state, both off colour alone", () => {
  assert.match(grid, /selected \? "border-brand-600 ring-2/);
  assert.match(grid, /data-selected=/);
  assert.match(grid, /In compare/, "a text label too");
  assert.match(grid, /shortlisted \? "border-brand-200 bg-brand-50"/);
});

test("the results list gives the grid a consistent gap and one column on a phone", () => {
  const results = read("src/app/employer/candidates/_results.tsx");
  assert.match(results, /"grid gap-5 sm:grid-cols-2 2xl:grid-cols-3"/);
});
