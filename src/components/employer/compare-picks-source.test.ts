import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Bug 27 Nov: tick 2 candidates, open a 3rd one's profile, "Add to compare", go Back: every pick was gone. Back replays
// a page's server snapshot from before the ticks; seeding the picks from it (and writing it back to the cookie) wiped
// them. The rule: the compare cookie is the one source of picks. A page's snapshot writes picks only when its link
// names them (?ids=).
const read = (p: string) => readFileSync(`src/${p}`, "utf8");

test("the candidates list starts its picks from the cookie, not its snapshot, unless the link names them", () => {
  const app = read("app/employer/candidates/_app.tsx");
  assert.match(app, /seedPicks\(initial\.wire\.activeProjectId, fromLink \? initial\.wire\.filters\.ids : readComparePicks\(/);
  assert.doesNotMatch(app, /seedPicks\(initial\.wire\.activeProjectId, initial\.wire\.filters\.ids\)/);
});

test("the compare page writes picks back only when its link names them", () => {
  const page = read("app/employer/compare/page.tsx");
  for (const m of page.matchAll(/<RememberSelection[^>]*compare=\{(\w+)\}/g)) assert.equal(m[1], "explicitIds");
  assert.match(page, /const explicitIds = sp\.ids !== undefined \? ids : undefined;/);
});

test("Add to compare on a profile adds to the picks saved now, not the ones the page loaded with", () => {
  const toggle = read("components/employer/compare-toggle.tsx");
  assert.match(toggle, /change\(projectId \? readComparePicks\(employerId, projectId\) : picked\)/);
  assert.match(toggle, /useState\(\(\) => \(typeof window !== "undefined" && projectId \? readComparePicks\(/);
});
