import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

/**
 * A project is live when it is `published` (the lifecycle status) or `active` (the legacy value, which is also the
 * column default). A query that keeps only status = 'active' silently drops every project published under the lifecycle
 * (the talent spotlight did). Scans src for a project-status equality to "active" alone; the shared SQL twin
 * `activeProject()` (lib/admin/scope.ts) is the way to say "live".
 */

const SRC = resolve(import.meta.dirname, "../..");
const ACTIVE_ONLY = /projects\.status\s*,\s*["']active["']|projects\.status\s*=\s*["']active["']|\bp(?:roject)?\.status\s*===?\s*["']active["']/;

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) yield full;
  }
}

test("no query filters projects to the legacy status 'active' alone", () => {
  const hits: string[] = [];
  for (const file of sources(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (ACTIVE_ONLY.test(line)) hits.push(`${relative(SRC, file)}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(hits, []);
});

test("the talent spotlight selects live projects through the shared published-or-active filter", () => {
  const src = readFileSync(join(SRC, "lib/schedulers.ts"), "utf8");
  const at = src.indexOf("async function talentSpotlight");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.match(body, /activeProject\(\)/);
});
