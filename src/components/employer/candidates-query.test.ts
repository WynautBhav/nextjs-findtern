import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// `_query.ts` imports the DB and `@/` aliases, so node:test can't load it: pin the wiring instead.
const src = readFileSync(join(import.meta.dirname, "../../app/employer/candidates/_query.ts"), "utf8");

test("a typed keyword is never remembered, only structured filters", () => {
  assert.match(src, /rememberQueryOf\(filters: Filters\): string \{\s*return filterParams\(filters, false\)/);
  assert.match(src, /if \(withKeyword && merged\.q\) next\.set\("q"/);
  // Links (and compare's "back") still carry it: queryOf keeps the default.
  assert.match(src, /const filters = filterParams\(merged\);/);
});

// The keyword (and the retired `view`) are stripped by restorableFilters; its behaviour is tested
// in lib/employer-filter-restore.test.ts. Here we only pin that the restore goes through it.
test("a cookie written before this still cannot restore a keyword", () => {
  assert.match(src, /restorableFilters\(await rememberedFilters\(uid, activeProjectId\), FILTER_KEYS\)/);
});

// The list, its total, the pages and every sort are built from one query, so the hired filter has to sit
// in that query (both the search and the Shortlist branch), not on the page after it.
test("the candidates query leaves out interns this employer has hired, in both branches", () => {
  assert.match(src, /\.where\(\s*and\(\s*savedOnly\s*\?[\s\S]*?:\s*and\(\.\.\.clauses\),\s*notHiredByEmployerSql\(uid\),\s*\),\s*\)/);
});

test("the Shortlist tab count and the compare picks leave hired interns out too", () => {
  assert.match(src, /hiredAmong\(db, uid, \[\.\.\.data\.shortlisted\]\)/);
  assert.match(src, /filters\.ids = filters\.ids\.filter\(\(id\) => !hiredPicks\.has\(id\)\)/);
});

test("the hired rule is the one every other screen uses (status hired, or hired_at set)", () => {
  const vis = readFileSync(join(import.meta.dirname, "../../lib/employer-visibility.ts"), "utf8");
  assert.match(vis, /export function hiredProposalSql\(\): SQL \{\s*return or\(eq\(proposals\.status, "hired"\), isNotNull\(proposals\.hiredAt\)\)!;/);
  const not = vis.slice(vis.indexOf("export function notHiredByEmployerSql"));
  assert.match(not, /NOT EXISTS[\s\S]*?\$\{proposals\.employerId\} = \$\{employerId\}[\s\S]*?\$\{proposals\.internId\} = \$\{users\.id\}[\s\S]*?\$\{hiredProposalSql\(\)\}/);
  // Never `hiredInternIds`: an admin "View as" would then hide everyone.
  assert.doesNotMatch(not.slice(0, not.indexOf("export async function hiredAmong")), /hiredInternIds/);
});
