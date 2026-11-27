import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Bug sheet 27 Nov, items 9 and 11 (display only, so these read the source: the repo has no DOM tests).
 * 9: a decided leave request still shows the student's reason. 11: text a person typed over several lines keeps its line breaks.
 */
const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** The JSX element that prints `expr`, i.e. the text between the nearest `<` before it and its closing `>`. */
function tagOf(src: string, expr: string): string {
  const at = src.indexOf(expr);
  assert.ok(at > -1, `${expr} is not rendered`);
  const open = src.lastIndexOf("<", at);
  return src.slice(open, src.indexOf(">", open));
}

test("9: Recent decisions show the reason the student gave, not only the officer's note", () => {
  const src = read("components/college/leave-requests-table.tsx");
  const decided = src.slice(src.indexOf('id="recent-h"'));
  assert.ok(decided.includes("r.reason"), "decided rows print r.reason");
  assert.ok(decided.includes("r.decisionNote"));
});

const PLACES: [file: string, expr: string][] = [
  ["components/college/leave-requests-table.tsx", "“{r.reason}”"],
  ["components/college/leave-requests-table.tsx", "Note: {r.decisionNote}"],
  ["components/admin/college-leave-panel.tsx", "“{r.reason}”"],
  ["components/intern/college-form.tsx", "Their note: {request.decisionNote}"],
  ["app/college/students/[id]/page.tsx", "{e.description}"],
  ["components/intern/kit/notification-timeline.tsx", "{n.message}"],
  ["components/app/notification-list.tsx", "{n.message}"],
  ["components/admin/cgpa/rows.tsx", "Note: {r.note}"],
  ["components/employer/takedown-banner.tsx", "{first.reason}</span>"],
  ["components/employer/takedown-banner.tsx", "{p.reason}</span>"],
  ["app/employer/projects/project-list.tsx", "{p.takenDownReason || \"No reason was recorded.\"}"],
  ["app/employer/projects/project-list.tsx", "{p.rejectionReason}</p>"],
  ["app/admin/projects/page.tsx", "{row.takenDownReason}</p>"],
];

for (const [file, expr] of PLACES) {
  test(`11: ${file} keeps line breaks in ${expr}`, () => {
    assert.match(tagOf(read(file), expr), /whitespace-pre-(line|wrap)/);
  });
}

test("11: the shared detail row keeps line breaks, so a note shown in any admin panel does too", () => {
  const src = read("components/app/primitives.tsx");
  const dd = src.slice(src.indexOf("export function DetailRow"));
  assert.match(dd.slice(dd.indexOf("<dd")), /^<dd[\s\S]*?whitespace-pre-line/);
});
