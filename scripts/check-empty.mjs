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
  // filled in below after review
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

const hits = [];
for (const base of ["src/app", "src/components"]) {
  for (const file of walk(join(root, base))) {
    const rel = relative(root, file);
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
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

for (const h of bad) console.log(`BARE     ${h.rel}:${h.n}  ${h.text.slice(0, 110)}`);
if (showAll) for (const h of allowed) console.log(`allowed  ${h.rel}:${h.n}  (${h.reason})`);
console.log(`${hits.length} hits: ${bad.length} bare (${count(bad)}), ${allowed.length} allowed (${count(allowed)})`);
process.exit(bad.length ? 1 : 0);
