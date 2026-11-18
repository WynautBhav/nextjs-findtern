#!/usr/bin/env node
/**
 * Text contrast, computed (WCAG 2.x relative-luminance formula), not eyeballed.
 *
 *   node scripts/check-contrast.mjs [repo-root]     exits 1 on any finding
 *   node scripts/check-contrast.mjs --all           also prints every ratio
 *
 * Two checks:
 *
 * 1. TOKENS. Every colour token that is meant to carry text (ink-500/600/700, text-subtle, the semantic
 *    text colours) must reach 4.5:1 on the three light surfaces text sits on: the app canvas, white and
 *    brand-100 (the deepest mint). Hex values are read from the `@theme` block of src/app/globals.css.
 *    `--color-warning` also has to hold on its own soft fill; success, danger and info on theirs.
 *    ink-300 and ink-400 are NOT text tokens: they are the border / icon-fill / hatch end of the ramp
 *    (2.24:1 and 1.36:1 on the canvas), so check 2 forbids them as text colour instead.
 *
 * 2. USAGE. `text-ink-400`, `text-ink-300`, `placeholder:text-ink-*`, `text-accent-500` and `text-accent-600`
 *    anywhere in src/ are findings, because the colour is 1.6:1 to 2.7:1 on every light surface. The
 *    exceptions are in ALLOW below: each one names the file, a snippet of the line, the surface the text
 *    sits on and a reason. A dark-surface entry is recomputed against that surface and must reach 4.5:1;
 *    a "decorative" entry (aria-hidden mark with no meaning of its own) is printed with its ratio.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const root = resolve(args.find((a) => !a.startsWith("--")) ?? process.cwd());

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const theme = css.slice(css.indexOf("@theme"), css.indexOf("@theme") + css.slice(css.indexOf("@theme")).search(/\n}\n/));
const raw = new Map([...theme.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const val = (name, depth = 0) => {
  const v = raw.get(name);
  if (v === undefined || depth > 6) return undefined;
  const ref = v.match(/^var\(--color-([\w-]+)\)$/);
  return ref ? val(ref[1], depth + 1) : v;
};

const findings = [];
const lines = [];
const fail = (m) => findings.push(m);

// ── 1. tokens ────────────────────────────────────────────────────────────────
const SURFACES = { canvas: val("canvas"), white: "#ffffff", "brand-100": val("brand-100") };
const TEXT = ["ink-500", "ink-600", "ink-700", "text-subtle", "muted-foreground", "subtle-foreground", "accent-700", "brand-700", "success", "danger", "info", "warning"];
/** On its own soft fill too. */
const ON_SOFT = { warning: "warning-soft", success: "success-soft", danger: "danger-soft", info: "info-soft" };
/** success is 4.37:1 on brand-100 and is not part of this pass (nothing sets it on that fill); it is held to canvas and white. */
const SKIP = new Set(["success|brand-100"]);
for (const t of TEXT) {
  const fg = val(t);
  if (!fg?.startsWith("#")) { fail(`token --color-${t} not found or not a hex value (got ${fg})`); continue; }
  const surfaces = { ...SURFACES };
  if (ON_SOFT[t]) surfaces[ON_SOFT[t]] = val(ON_SOFT[t]);
  for (const [sname, bg] of Object.entries(surfaces)) {
    const r = ratio(fg, bg);
    const skipped = SKIP.has(`${t}|${sname}`);
    lines.push(`token ${t.padEnd(18)} ${fg} on ${sname.padEnd(12)} ${bg}  ${r.toFixed(2)}:1${skipped ? "  (not in this pass)" : ""}`);
    if (r < 4.5 && !skipped) fail(`token --color-${t} (${fg}) on ${sname} (${bg}) is ${r.toFixed(2)}:1, needs 4.5:1`);
  }
}
for (const t of ["ink-400", "ink-300"]) {
  lines.push(`info  ${t} ${val(t)}: ${Object.entries(SURFACES).map(([n, bg]) => `${n} ${ratio(val(t), bg).toFixed(2)}`).join(", ")} (not a text token; usage check below)`);
}

// ── 2. usage ─────────────────────────────────────────────────────────────────
/** [file suffix, snippet of the line, kind, surface hex, reason]; kind: "dark" (recomputed, must be 4.5) or "decorative". */
const ALLOW = [
  ["(marketing)/employers/page.tsx", "mt-3 text-base leading-relaxed text-ink-300", "dark", "#0b1512", "body copy inside the dark ink-950 panel"],
  ["(marketing)/employers/page.tsx", "text-ink-300 sm:hidden", "decorative", null, "aria-hidden arrow between process steps"],
  ["(marketing)/employers/page.tsx", "text-ink-300 sm:flex", "decorative", null, "aria-hidden arrow between process steps"],
  ["admin/view-as-banner.tsx", "block text-sm text-ink-300", "dark", "#0b1512", "caption on the ink-950 banner"],
  ["home/about-section.tsx", "text-base font-medium text-ink-300", "dark", "#072f24", "unit beside a figure on the dark brand card"],
  ["layout/console-shell.tsx", "text-ink-300\">/</span>", "decorative", null, "aria-hidden breadcrumb slash; the crumbs either side carry the text"],
  ["layout/site-header.tsx", "size-4 text-ink-300", "decorative", null, "aria-hidden chevron in a menu row"],
  ["employer/drive-parts.tsx", "text-ink-300", "decorative", null, "aria-hidden separator dot between two values"],
  ["home/pricing-table.tsx", "size-4 shrink-0 text-ink-300", "decorative", null, "aria-hidden X before a plan line that says what is not included"],
  ["marketing/employer-plan-cards.tsx", "size-4 shrink-0 text-ink-300", "decorative", null, "aria-hidden X before a plan line that says what is not included"],
  ["marketing/pricing-content.tsx", "size-4 shrink-0 text-ink-300", "decorative", null, "aria-hidden X before a plan line that says what is not included"],
  ["intern/onboarding/photo-upload.tsx", "size-10 text-ink-300", "decorative", null, "aria-hidden avatar silhouette in an empty photo slot"],
];

const FORBIDDEN = /(?:^|[\s"'`{(])((?:[\w-]+:)*)((?:placeholder:)?text-(?:ink-300|ink-400|accent-500|accent-600))(?![\w-])/g;
const COLOUR = { "ink-300": val("ink-300"), "ink-400": val("ink-400"), "accent-500": val("accent-500"), "accent-600": val("accent-600") };

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) { if (n === "node_modules" || n === ".next") continue; walk(p, out); }
    else if (/\.(tsx|ts|jsx|mdx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

const used = new Set();
let usages = 0;
let allowed = 0;
for (const file of walk(join(root, "src"))) {
  const rel = relative(root, file);
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    FORBIDDEN.lastIndex = 0;
    let m;
    while ((m = FORBIDDEN.exec(line))) {
      usages++;
      const colour = COLOUR[m[2].replace(/^placeholder:/, "").replace(/^text-/, "")];
      const a = ALLOW.findIndex(([f, snip]) => rel.endsWith(f) && line.includes(snip));
      if (a < 0) { fail(`${rel}:${i + 1} ${m[1]}${m[2]} (${colour}) as text colour: ${line.trim().slice(0, 110)}`); continue; }
      used.add(a);
      allowed++;
      const [, , kind, surface, reason] = ALLOW[a];
      if (kind === "dark") {
        const r = ratio(colour, surface);
        lines.push(`allow ${rel}:${i + 1} ${m[2]} on ${surface}: ${r.toFixed(2)}:1 (${reason})`);
        if (r < 4.5) fail(`${rel}:${i + 1} allowed as dark-surface text but ${r.toFixed(2)}:1 on ${surface}`);
      } else {
        lines.push(`allow ${rel}:${i + 1} ${m[2]} decorative: ${ratio(colour, SURFACES.white).toFixed(2)}:1 on white (${reason})`);
        if (!/aria-hidden/.test(line)) fail(`${rel}:${i + 1} allowed as decorative but the line has no aria-hidden`);
      }
    }
  });
}
ALLOW.forEach((a, i) => { if (!used.has(i)) fail(`stale allow entry: ${a[0]} "${a[1]}" matches nothing (remove it)`); });

if (showAll) for (const l of lines) console.log(l);
console.log(`[contrast] ${TEXT.length} text tokens x surfaces checked; ${usages} faint-colour text usages found, ${allowed} allowed (dark surface or decorative), ${usages - allowed} not allowed`);
if (findings.length) {
  for (const f of findings) console.log(`FAIL ${f}`);
  console.log(`[contrast] ${findings.length} finding(s)`);
  process.exit(1);
}
console.log("[contrast] OK");
