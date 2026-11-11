import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression: a console-only `#main > .section-y` rule once zeroed the padding
// of every marketing section (marketing <main> is also #main) and the site
// looked cramped. Every bare `#main >` rule must skip `data-site`.
const css = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/(marketing)/layout.tsx", "utf8");

test("no unscoped '#main >' rule can hit the marketing layout", () => {
  const bare = css.match(/^#main\s*>/gm) ?? [];
  assert.equal(bare.length, 0, "scope console rules with #main:not([data-site])");
});

test("marketing <main> carries data-site", () => {
  assert.match(layout, /<main id="main" data-site/);
});
