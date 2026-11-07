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
