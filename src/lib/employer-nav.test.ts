import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DRIVES_HREF, employerTabHrefs, withDrivesItem } from "./employer-nav.ts";

const groups = [
  { title: "Hiring", items: [{ href: "/employer/dashboard" }, { href: "/employer/schedule" }, { href: "/employer/projects" }] },
  { title: "After the hire", items: [{ href: "/employer/timesheets" }] },
];
const drives = { href: DRIVES_HREF };

test("an employer with a drive gets Campus drives in the nav, right after Interviews", () => {
  const out = withDrivesItem(groups, true, drives);
  assert.deepEqual(out[0].items.map((i) => i.href), ["/employer/dashboard", "/employer/schedule", DRIVES_HREF, "/employer/projects"]);
  assert.deepEqual(out[1], groups[1]);
});

test("an employer without a drive sees the nav unchanged", () => {
  assert.equal(withDrivesItem(groups, false, drives), groups);
});

test("the phone tab bar carries Campus drives too, and only for an employer with a drive", () => {
  assert.ok(employerTabHrefs(true).includes(DRIVES_HREF));
  assert.ok(!employerTabHrefs(false).includes(DRIVES_HREF));
  assert.equal(employerTabHrefs(false).length, 4);
});

test("the employer layout builds its nav from this helper on every page", () => {
  const layout = readFileSync("src/app/employer/layout.tsx", "utf8");
  assert.match(layout, /withDrivesItem\(/);
  assert.match(layout, /employerTabHrefs\(/);
});
