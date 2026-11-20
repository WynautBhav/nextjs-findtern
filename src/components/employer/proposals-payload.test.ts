import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// The page needs the DB, so pin the wiring: the client list gets initials, not the full name, before the hire.
const src = readFileSync(join(import.meta.dirname, "../../app/employer/proposals/page.tsx"), "utf8");

test("proposals list sends the intern's full name to the browser only after the hire", () => {
  assert.match(src, /user: userFor\(row\.firstName, row\.lastName, hired\.has\(row\.proposal\.internId\)\)/);
  const fn = src.slice(src.indexOf("function userFor"), src.indexOf("export default"));
  assert.match(fn, /if \(hired\) return \{ firstName: first \?\? "", lastName: last \?\? "" \}/);
  assert.match(fn, /initialsOf\(first \?\? "", last \?\? ""\)/);
  assert.doesNotMatch(src, /firstName: row\.firstName/);
});

// The Verifying tab "never updated": the page remounted the manager through a `key` built from status and gate state
// (dropping the tab and filters, and ignoring every other change), and the tab was local state seeded once from ?status=.
test("proposals page wiring: a refreshed list updates the manager in place and the URL names the tab", () => {
  const manager = readFileSync(join(import.meta.dirname, "proposals-manager.tsx"), "utf8");
  assert.doesNotMatch(src, /<ProposalsManager[^>]*\bkey=/, "no remount key on the manager");
  assert.match(manager, /useSearchParams\(\)\.get\("status"\)/, "the tab comes from the URL");
  assert.match(manager, /history\.replaceState\(null, "", `\$\{pathname\}\$\{tabQuery\(/, "a click writes the tab to the URL");
  assert.doesNotMatch(manager, /useState<TabKey>/, "no local tab state to drift from the URL");
  assert.match(manager, /if \(seen !== initialProposals\)/, "a new server list replaces the local copy");
});
