#!/usr/bin/env node
/**
 * Key routes must have their own loading.tsx, shaped like the page. Without one a route falls back to the
 * generic list placeholder of its section, which is the wrong shape and shifts when the page lands.
 *
 *   node scripts/check-loading.mjs [repo-root]     exits 1 if any route lacks its own, or its own is empty
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? process.cwd());
const ROUTES = [
  "intern/dashboard",
  "intern/profile",
  "intern/notifications",
  "employer/dashboard",
  "employer/proposal/[id]",
  "employer/schedule",
];

let bad = 0;
for (const route of ROUTES) {
  const file = join(root, "src/app", route, "loading.tsx");
  if (!existsSync(file)) {
    console.log(`MISSING  ${route}/loading.tsx`);
    bad++;
    continue;
  }
  const src = readFileSync(file, "utf8");
  // The same contract as the other loading files: one status region, busy, with a screen-reader label.
  const ok = /role="status"/.test(src) && /aria-busy="true"/.test(src) && /className="sr-only"/.test(src) && /export default function/.test(src);
  console.log(`${ok ? "ok      " : "INCOMPLETE"} ${route}/loading.tsx`);
  if (!ok) bad++;
}
console.log(bad ? `${bad} of ${ROUTES.length} routes lack their own loading placeholder` : `all ${ROUTES.length} routes have their own loading placeholder`);
process.exit(bad ? 1 : 0);
