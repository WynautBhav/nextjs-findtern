#!/usr/bin/env node
/**
 * Bare "No ... yet / found / here" lines in the UI. An empty list should say why it is empty and offer one next
 * step (EmptyScene, or AdminEmpty inside an admin table), not leave a dead-end sentence.
 *
 *   node scripts/check-empty.mjs [repo-root]     exits 1 while any hit is outside the allow list
 *   node scripts/check-empty.mjs --all           also prints the allowed hits with their reasons
 *
 * What counts as a hit: a rendered line in src/app or src/components (tests, API routes, comments excluded)
 * that holds `No <words> yet|found|here`, unless it is the title of an EmptyScene / AdminEmpty / `empty={{ title }}`
 * (those already carry a body and, where one exists, an action).
 *
 * The allow list is for text that is not an empty list: a one-word cell value, a tile caption, a sentence inside a
 * paragraph, a search-field miss. Each entry matches a file plus a snippet of the line (not a line number, so edits
 * above it do not break it) and must give a reason.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const root = resolve(args.find((a) => !a.startsWith("--")) ?? process.cwd());

const HIT = /\bNo\b[^"'`<>{}]{0,80}?\b(yet|found|here)\b/;
const COMMENT = /^\s*(\/\/|\/\*|\*|\{\/\*)/;
// A title is already inside an empty-state component, which has its own body and action.
const TITLE_PROP = /\btitle(=|:)\s*(\{?\s*)?["'`]|\btitle=\{[^}]*\?\s*["'`][^"'`]*["'`]\s*:\s*["'`]No\b/;

/** [file suffix, snippet of the line, reason] */
const ALLOW = [
  // A one-word or one-line cell, caption or tile hint: it labels a value, it is not an empty list.
  ["admin/colleges/page.tsx", "No login yet", "table cell value"],
  ["admin/transactions/page.tsx", "No payouts recorded yet", "caption under a figure tile"],
  ["college/page.tsx", "No students yet", "caption under a figure tile; the student list below carries the empty state"],
  ["admin/dashboard/week-panel.tsx", "No proposals sent yet this week", "caption under a figure"],
  ["admin/dashboard/next-interview-card.tsx", "No meeting link yet", "field value inside one card"],
  ["admin/intern-360-view.tsx", "No summary yet", "field fallback inside a preview paragraph"],
  ["admin/intern-360-view.tsx", "No time slots offered yet", "one line inside a single interview card, beside its status badge"],
  ["admin/intern-360-view.tsx", "No meeting link yet", "field value inside one card"],
  ["admin/college-seat-batches.tsx", "No code yet.", "sentence inside the code summary line, not a list"],
  ["admin/ai-report-batch.tsx", "No candidate found", "result of a search the person just ran; the search box beside it is the next step"],
  ["employer/intern/[id]/page.tsx", "No AI interview score yet", "one profile section the employer cannot act on; the line says why"],
  ["employer/candidate-quick-view.tsx", "No AI interview score yet", "one profile section the employer cannot act on; the line says why"],
  ["employer/candidate-row-parts.tsx", "No skills listed yet", "chip-list fallback inside a candidate row"],
  ["employer/dashboard/project-progress.tsx", "No proposals yet", "summary text on a project row (the row links to its candidates)"],
  ["employer/orders/shared.tsx", "No instalment paid yet", "status label on a pill"],
  ["employer/orders-manager.tsx", "No hires yet", "page lede; the Hires panel below holds the empty state with its action"],
  ["employer/orders/schedule-panel.tsx", "No hire is fully paid yet", "body of an existing EmptyScene on a filtered view; the filter chips above are the action"],
  ["employer/projects-manager.tsx", "No skills yet, so no matches", "per-row hint on a project card"],
  ["employer/proposals-manager.tsx", "No offers in this group yet", "body of an existing EmptyScene that already offers Clear filters"],
  ["employer/timesheet-review.tsx", "No changes yet", "label on a disabled save button"],
  ["intern/kit/employer-card.tsx", "No skills yet", "field fallback on the dark preview card of what employers see"],
  ["intern/onboarding/preview-step.tsx", "No skills yet", "field fallback in a block that carries its own Edit button"],
  ["intern/interviews/page.tsx", "No written feedback yet", "detail string on an interview status"],
  ["intern/stipend/payment-ledger.tsx", "No reference yet", "reference text in a ledger row"],
  ["messaging/thread-list.tsx", "No messages yet", "last-message preview inside a conversation row"],
  ["college/drive-builder.tsx", "No branches recorded yet", "inline hint beside the branch chips in a form"],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "api" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

// Every static `href: "/route"` in a file that renders an empty state must resolve to a page or route under src/app.
const pages = [];
(function collect(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collect(p);
    else if (name === "page.tsx" || name === "route.ts") pages.push(relative(join(root, "src/app"), dir).split("/").filter((seg) => !/^\(.*\)$/.test(seg)));
  }
})(join(root, "src/app"));
const resolves = (path) => {
  const segs = path.split("/").filter(Boolean);
  // "/employer/intern/" is a prefix an id is appended to: some page must sit under it.
  if (path.endsWith("/")) return pages.some((pg) => pg.length > segs.length && segs.every((seg, i) => seg === pg[i]));
  return pages.some((pg) => pg.length === segs.length && pg.every((seg, i) => /^\[.*\]$/.test(seg) || seg === segs[i]));
};
const deadLinks = [];

const hits = [];
for (const base of ["src/app", "src/components"]) {
  for (const file of walk(join(root, base))) {
    const rel = relative(root, file);
    const text = readFileSync(file, "utf8");
    if (/EmptyScene|AdminEmpty/.test(text)) {
      for (const m of text.matchAll(/\bhref:\s*["'`](\/[^"'`?#$]*)/g)) if (!resolves(m[1])) deadLinks.push(`${rel}  ${m[1]}`);
    }
    text.split("\n").forEach((line, i) => {
      if (COMMENT.test(line) || !HIT.test(line) || TITLE_PROP.test(line)) return;
      hits.push({ rel, n: i + 1, text: line.trim() });
    });
  }
}

const area = (rel) =>
  /admin/.test(rel) ? "admin" : /college/.test(rel) ? "college" : /employer/.test(rel) ? "employer" : /messag/.test(rel) ? "messaging" : /intern/.test(rel) ? "intern" : "other";

const bad = [];
const allowed = [];
for (const h of hits) {
  const a = ALLOW.find(([f, snip]) => h.rel.endsWith(f) && h.text.includes(snip));
  (a ? allowed : bad).push({ ...h, reason: a?.[2] });
}

const count = (list) => {
  const by = {};
  for (const h of list) by[area(h.rel)] = (by[area(h.rel)] ?? 0) + 1;
  return Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
};

for (const d of deadLinks) console.log(`DEADLINK ${d}  (no page or route under src/app)`);
for (const h of bad) console.log(`BARE     ${h.rel}:${h.n}  ${h.text.slice(0, 110)}`);
if (showAll) for (const h of allowed) console.log(`allowed  ${h.rel}:${h.n}  (${h.reason})`);
console.log(`${hits.length} hits: ${bad.length} bare (${count(bad)}), ${allowed.length} allowed (${count(allowed)})`);
process.exit(bad.length || deadLinks.length ? 1 : 0);
