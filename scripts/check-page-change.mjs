#!/usr/bin/env node
/**
 * Static guard for page-change feedback (WP8). Fast, no browser, no server;
 * e2e/page-change.e2e.mjs is the behavioural check.
 *
 *   node scripts/check-page-change.mjs
 *
 * 1. Programmatic navigation goes through `useProgressRouter` (the top bar
 *    starts with the push), never a bare `useRouter().push/replace`. Anything
 *    else gives no feedback until the next page is ready. `router.refresh()`
 *    and `router.back()` are not page changes here and are fine on `useRouter`.
 *    Allowed: console-shell.tsx (its sign-out `replace` shows a busy state of
 *    its own and the file is shared with other work).
 * 2. The bar waits before it shows (no flash on a fast navigation), has a
 *    still variant for reduced motion, and also starts on back/forward.
 * 3. No loading.tsx above the auth, marketing-detail and drive pages, whose
 *    404 / 307 answers a streaming boundary would turn into 200 (see below).
 *
 * Exit 1 with a list of violations.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const ALLOW_BARE_ROUTER = new Set(["src/components/layout/console-shell.tsx", "src/components/layout/navigation-progress.tsx"]);
const problems = [];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?)$/.test(name)) yield p;
  }
}

// 1. Bare router.push / router.replace.
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (ALLOW_BARE_ROUTER.has(rel)) continue;
  const text = readFileSync(file, "utf8");
  const importsBare = /import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from\s*["']next\/navigation["']/.test(text);
  if (!importsBare) continue;
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (/\brouter\.(push|replace)\(/.test(line)) problems.push(`${rel}:${i + 1}: router.${/push/.test(line) ? "push" : "replace"} on a bare useRouter; use useProgressRouter from @/components/layout/navigation-progress`);
  });
}

// 2. The bar itself.
const barFile = join(SRC, "components/layout/navigation-progress.tsx");
const bar = readFileSync(barFile, "utf8");
for (const [re, why] of [
  [/SHOW_AFTER_MS\s*=\s*\d+/, "no show delay (SHOW_AFTER_MS): the bar would flash on fast navigations"],
  [/motion-reduce:/, "no motion-reduce variant"],
  [/popstate/, "does not start on back/forward"],
  [/role="progressbar"/, "lost role=progressbar"],
  [/export function useProgressRouter/, "useProgressRouter is not exported"],
]) {
  if (!re.test(bar)) problems.push(`src/components/layout/navigation-progress.tsx: ${why}`);
}
const delay = Number(/SHOW_AFTER_MS\s*=\s*(\d+)/.exec(bar)?.[1] ?? 0);
if (delay && (delay < 50 || delay > 150)) problems.push(`SHOW_AFTER_MS is ${delay}; keep it 50-150 ms (instant under 100 ms, visible within 150)`);

// 3. No loading boundary above a page that answers notFound() or redirect().
//    Measured on a build: a boundary streams a 200 before the page runs, so an
//    unknown drive token or opportunity id stops being a 404 (QA-150), and a
//    signed-in visit to /login or /signup loses its 307 for a <meta refresh>
//    that waits a second. Clicks already get the top bar. e2e/page-change.e2e.mjs
//    asserts the status codes against a running server.
const NO_BOUNDARY = [
  "src/app/(auth)/loading.tsx",
  "src/app/(auth)/login/loading.tsx",
  "src/app/(auth)/signup/loading.tsx",
  "src/app/(marketing)/loading.tsx",
  "src/app/(marketing)/opportunities/loading.tsx",
  "src/app/(marketing)/opportunities/[id]/loading.tsx",
  "src/app/drive/loading.tsx",
  "src/app/drive/[token]/loading.tsx",
];
for (const f of NO_BOUNDARY) {
  if (existsSync(join(ROOT, f))) problems.push(`${f}: a loading boundary here turns 404/307 answers into 200 (see comment in scripts/check-page-change.mjs)`);
}

if (problems.length) {
  console.error(`check-page-change: ${problems.length} problem(s)`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("check-page-change: ok");
