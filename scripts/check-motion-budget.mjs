#!/usr/bin/env node
/**
 * Motion budget for the signed-in consoles (intern, employer, college, admin and the shared chrome they use).
 *
 *   node scripts/check-motion-budget.mjs [repo-root]     exits 1 while anything is over budget
 *   node scripts/check-motion-budget.mjs --all           also prints the allowed items with their reasons
 *   node scripts/check-motion-budget.mjs --no-allow      the raw count, allow list ignored
 *
 * The rules (docs: brief section C WP2):
 *   - every transition / animation lasts 300 ms or less, and starts within 150 ms (a stagger step is counted at its cap);
 *   - and its easing is ease-out (no ease-in, no ease-in-out);
 *   - the only exceptions are in ALLOW below. A "data" entry is a one-time reveal of a figure (gauge, ring, count-up);
 *     it may run up to 600 ms with NO delay, and the script re-measures it, so an allow entry cannot hide a slower one.
 *
 * What is read (regex, per line / per declaration; see parseTimes):
 *   Tailwind   duration-300, duration-[260ms], duration-[var(--dur-slow)], delay-150, motion-safe:duration-500 ...
 *   JS motion  `duration: 0.7`, `duration: reduce ? 0 : 0.7`, `delay: 0.08 * i` (the largest number counts, in seconds;
 *              a `* i` stagger with no Math.min cap is counted as 5 items), `staggerChildren: 0.05` (x5)
 *   CSS        `animation: name 560ms ease 120ms`, `transition: a 0.35s ease, b 0.18s ease`, `--animate-x: ...`,
 *              `animation-delay: 700ms` / `style={{ animationDelay: "700ms" }}`; first time = duration, second = delay
 * Not counted, on purpose: infinite loops (marquee, pulse-dot, glow-drift: ambient, not a response to anything),
 * `type: "spring"` (no fixed duration; the stiffness values in use settle in about 300 ms), `prefers-reduced-motion: reduce`
 * blocks (they set 0.01 ms), and the marketing site (src/app/(marketing), (auth) not excluded, blog, components/home,
 * marketing, motion, watermelon, seo, brand, layout/site-*), which the brief leaves out of scope.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const noAllow = args.includes("--no-allow"); // the raw count: every over-budget item, allow list ignored
const root = resolve(args.find((a) => !a.startsWith("--")) ?? process.cwd());

const MAX = 300; // ms, duration
const MAX_DELAY = 150; // ms, a delay or a stagger step run up to (one-time reveals only)
const DATA_MAX = 600; // ms, allowed only through ALLOW "data" entries, no delay

const EXCLUDE = [
  "src/app/(marketing)/", "src/app/blog/", "src/components/home/", "src/components/marketing/", "src/components/motion/",
  "src/components/watermelon/", "src/components/seo/", "src/components/brand/", "src/components/layout/site-header.tsx",
  "src/components/layout/site-footer.tsx", "src/components/layout/get-started-menu.tsx",
  "src/app/api/", "src/lib/", // server code: a `duration:` there is a data field, not motion
];

/** [file suffix, snippet of the line / declaration, kind, reason]. kind: "data" (<=600 ms, no delay, re-measured) or "exempt". */
const ALLOW_ALL = [
  ["intern/stipend/stipend-gauge.tsx", "stipend-draw", "data", "the stipend gauge draws once, 500 ms, no delay; the pending arc grows out of the paid arc in the same sweep. A 180 degree arc carrying a money figure reads as a sweep only above 300 ms"],
  ["app/count-up.tsx", "duration = 0.5", "data", "a figure counting up once on mount (500 ms; under 300 ms it reads as a flicker, not a count); reduced motion shows the end value"],
  ["app/primitives.tsx", "thread-breath", "exempt", "one 2.4 s breath of the thread mark, played once, documented in the file"],
  ["app/thread.tsx", "duration:", "exempt", "WP5b owns this file (thread line and breath), so WP2 does not edit it"],
  ["app/globals.css", "--animate-nav-progress", "exempt", "the top navigation bar creeps toward 90% while a page loads; its length is the wait, not a design duration"],
  ["app/globals.css", "transform 620ms var(--ease-out-expo)", "exempt", "the marketing heading underline (.smile::after), out of scope per the brief"],
  ["app/globals.css", "opacity 340ms ease", "exempt", "the marketing heading underline (.smile::after), out of scope per the brief"],
  ["app/globals.css", "opacity 0.8s var(--ease-out-expo)", "exempt", "the marketing scroll reveal (.is-revealed), out of scope per the brief"],
  ["app/globals.css", "transform 0.8s var(--ease-out-expo)", "exempt", "the marketing scroll reveal (.is-revealed), out of scope per the brief"],
];

const ALLOW = noAllow ? [] : ALLOW_ALL;

const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const cssVars = new Map([...css.matchAll(/--([\w-]+):\s*([\d.]+)(ms|s)\s*;/g)].map((m) => [m[1], Number(m[2]) * (m[3] === "s" ? 1000 : 1)]));
const msOf = (n, unit) => Number(n) * (unit === "s" ? 1000 : 1);

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) { if (n === "node_modules" || n === ".next") continue; walk(p, out); }
    else if (/\.(tsx|ts|css)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

/** area for the by-script count */
function area(rel) {
  if (rel === "src/app/globals.css") return "globals.css";
  const m = rel.match(/^src\/(?:app|components)\/(admin|employer|intern|college)\b/);
  return m ? m[1] : "shared";
}

/** Items on a line: { kind, ms, delay, text } */
function parseLine(line) {
  const items = [];
  // Tailwind utilities
  for (const m of line.matchAll(/(?<![\w-])((?:[\w\[\]()@&:,.'=*>%-]+:)*)(duration|delay)-(\d+|\[[^\]]+\])/g)) {
    const [, variants, prop, raw] = m;
    let ms;
    if (/^\d+$/.test(raw)) ms = Number(raw);
    else {
      const inner = raw.slice(1, -1);
      const lit = inner.match(/^([\d.]+)(ms|s)$/);
      const v = inner.match(/^var\(--([\w-]+)\)$/);
      ms = lit ? msOf(lit[1], lit[2]) : v ? (cssVars.get(v[1]) ?? NaN) : NaN;
    }
    if (Number.isNaN(ms)) continue;
    items.push({ kind: `tw ${prop}`, ms, variants, text: m[0] });
  }
  // JS motion options
  const jsItems = [];
  for (const m of line.matchAll(/\b(duration|delay)\s*:\s*((?:[^,}\n(]|\([^)]*\))+)/g)) {
    const expr = m[2];
    const nums = [...expr.matchAll(/(?<![\w.])(\d*\.?\d+)(?![\w.]*\s*(?:ms|s)\b)/g)].map((x) => Number(x[1]));
    if (!nums.length || /["'`]/.test(expr.slice(0, 1))) continue;
    if (m[1] === "delay" && /\*/.test(expr) && !/Math\.min\(/.test(expr)) nums.push(...nums.map((n) => n * 5)); // uncapped stagger: 5 items
    if (m[1] === "delay" && /Math\.min\(\s*\w+\s*,\s*(\d+)\s*\)/.test(expr)) {
      const cap = Number(expr.match(/Math\.min\(\s*\w+\s*,\s*(\d+)\s*\)/)[1]);
      const step = nums.find((n) => n < 1 && n > 0) ?? 0;
      jsItems.push({ kind: "js delay", ms: Math.round(cap * step * 1000), text: m[0] });
      continue;
    }
    // `duration` of a spring is not a thing; ignore spring configs
    jsItems.push({ kind: `js ${m[1]}`, ms: Math.round(Math.max(...nums) * 1000), text: m[0] });
  }
  // duration and delay on one line are one animation: the duration is judged with the delay added
  const jsDelay = Math.max(0, ...jsItems.filter((x) => x.kind === "js delay").map((x) => x.ms));
  for (const x of jsItems) items.push(x.kind === "js duration" ? { ...x, delay: jsDelay } : x.kind === "js delay" && jsItems.some((y) => y.kind === "js duration") ? { ...x, ms: 0, delay: x.ms, text: x.text } : x);
  for (const m of line.matchAll(/^\s*duration\s*=\s*([\d.]+)\s*,/g)) items.push({ kind: "js duration default", ms: Math.round(Number(m[1]) * 1000), text: m[0].trim() });
  for (const m of line.matchAll(/\bstaggerChildren\s*:\s*([\d.]+)/g)) items.push({ kind: "js stagger x5", ms: Math.round(Number(m[1]) * 5000), text: m[0] });
  return items;
}

/** CSS declarations (also inside TSX strings): animation / transition shorthands and animation-delay. */
function parseDecls(text) {
  const items = [];
  const re = /(?<![\w-])(animation|transition|--animate-[\w-]+)\s*:\s*["'`]?([^;}"'`]*)/g;
  for (const m of text.matchAll(re)) {
    if (/^\s*(none|inherit|unset|initial)\b/.test(m[2])) continue;
    const parts = m[2].split(/,(?![^(]*\))/); // comma-separated lists, not commas inside cubic-bezier()
    for (const part of parts) {
      if (/\binfinite\b/.test(part)) continue;
      const times = [...part.replace(/cubic-bezier\([^)]*\)/g, "").matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)].map((x) => msOf(x[1], x[2]));
      const varTimes = [...part.matchAll(/var\(--([\w-]+)\)/g)].map((x) => cssVars.get(x[1])).filter((x) => x !== undefined);
      const all = [...times, ...varTimes];
      if (!all.length) continue;
      items.push({ kind: m[1] === "transition" ? "css transition" : "css animation", ms: all[0], delay: all[1] ?? 0, easing: part, text: `${m[1]}: ${part.trim()}`, index: m.index });
    }
  }
  for (const m of text.matchAll(/(?:animation-delay|animationDelay)\s*:\s*["'`]?\s*([\d.]+)(ms|s)/g)) items.push({ kind: "css delay", ms: 0, delay: msOf(m[1], m[2]), text: m[0], index: m.index });
  return items;
}

const BAD_EASE = /\bease-in-out\b|\bease-in\b(?!-)|\beaseInOut\b|\beaseIn\b|--ease-in-out-quart\)|\bease-in-out-quart\b/;

const files = walk(join(root, "src")).filter((f) => {
  const rel = relative(root, f);
  return !EXCLUDE.some((e) => rel.startsWith(e));
});

const offenders = [];
const allowedHits = [];
const usedAllow = new Set();
let counted = 0;

function judge(rel, lineNo, line, item, extraDelay = 0) {
  counted++;
  const delay = (item.delay ?? 0) + extraDelay;
  const badEase = item.easing && BAD_EASE.test(item.easing);
  const over = item.ms > MAX || delay > MAX_DELAY;
  if (!over && !badEase) return;
  const a = ALLOW.findIndex(([f, snip]) => rel.endsWith(f) && (line.includes(snip) || item.text.includes(snip)));
  if (a >= 0) {
    usedAllow.add(a);
    const [, , kind, reason] = ALLOW[a];
    if (kind === "data" && (item.ms > DATA_MAX || delay > 0 || badEase)) {
      offenders.push({ rel, lineNo, why: `allowed as a data reveal but measures ${item.ms} ms${delay ? ` + ${delay} ms delay` : ""}${badEase ? " with a non-ease-out curve" : ""} (cap ${DATA_MAX} ms, no delay)`, text: item.text });
      return;
    }
    allowedHits.push({ rel, lineNo, ms: item.ms, delay, kind, reason, text: item.text });
    return;
  }
  offenders.push({ rel, lineNo, why: badEase ? `non-ease-out curve (${item.ms} ms)` : `${item.ms} ms${delay ? ` + ${delay} ms delay` : ""} (${item.kind}); budget ${MAX} ms, delay ${MAX_DELAY} ms`, text: item.text });
}

for (const file of files) {
  const rel = relative(root, file);
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  // Skip reduced-motion blocks in CSS: they set 0.01ms.
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\/\*|\*|\{\/\*)/.test(line)) return; // comment lines
    // Tailwind + JS items from this line
    for (const it of parseLine(line)) {
      if (it.variants && /(^|:)(starting|motion-reduce|group-hover|hover)(:|$)/.test(it.variants) === false) { /* counted */ }
      judge(rel, i + 1, line, it);
    }
    // ease on Tailwind classes / JS easings (not inside an `infinite` loop on the same line)
    if (!/\binfinite\b/.test(line) && !/(?:animation|transition)\s*:/.test(line) && BAD_EASE.test(line.replace(/\/\/.*$/, ""))) {
      judge(rel, i + 1, line, { kind: "easing", ms: 0, easing: line, text: (line.match(BAD_EASE) ?? [""])[0] });
    }
  });
  // CSS declarations: whole-text scan so multi-line `transition:` values are one declaration
  for (const it of parseDecls(src)) {
    const lineNo = src.slice(0, it.index).split("\n").length;
    judge(rel, lineNo, lines[lineNo - 1] ?? "", it);
  }
}

// An `animation-delay` or `transition-delay` that only adds to a duration elsewhere is judged with its own total above.
ALLOW.forEach((a, i) => { if (!usedAllow.has(i)) offenders.push({ rel: a[0], lineNo: 0, why: `stale allow entry "${a[1]}" matches nothing over budget (remove it)`, text: "" }); });

const by = {};
for (const o of offenders) (by[area(o.rel)] ??= []).push(o);

if (showAll) for (const a of allowedHits) console.log(`allow ${a.rel}:${a.lineNo} ${a.ms}${a.delay ? `+${a.delay}` : ""} ms [${a.kind}] ${a.text.slice(0, 70)} - ${a.reason}`);
console.log(`[motion-budget] ${counted} motion declarations read in ${files.length} console files; ${allowedHits.length} over budget but allowed, ${offenders.length} offenders`);
if (offenders.length) {
  console.log(`[motion-budget] by area: ${Object.entries(by).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
  const byFile = {};
  for (const o of offenders) byFile[o.rel] = (byFile[o.rel] ?? 0) + 1;
  console.log(`[motion-budget] by file: ${Object.entries(byFile).map(([k, v]) => `${k.replace(/^src\//, "")} ${v}`).join(", ")}`);
  for (const o of offenders) console.log(`FAIL ${o.rel}:${o.lineNo} ${o.why} :: ${o.text.replace(/\s+/g, " ").slice(0, 110)}`);
  process.exit(1);
}
console.log("[motion-budget] OK");
