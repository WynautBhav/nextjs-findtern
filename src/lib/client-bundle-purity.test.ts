import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

// Regression: a "use client" file reached node:zlib through a helper, so the browser bundle shipped
// Node polyfills (~244KB) and an eval probe that a strict CSP reports. Client code must not reach node: modules.
const SRC = resolve("src");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
const RE = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base.replace(/\.js$/, ".ts")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function nodeImportsReachable(entry: string): string[] {
  const seen = new Set<string>();
  const bad: string[] = [];
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    if (f !== entry && /^\s*["']use server["']/m.test(src.slice(0, 200))) continue;
    for (const m of src.matchAll(RE)) {
      const spec = m[1] ?? m[2];
      if (/^node:/.test(spec)) bad.push(`${f.replace(SRC, "src")} -> ${spec}`);
      else {
        const next = resolveSpec(f, spec);
        if (next) stack.push(next);
      }
    }
  }
  return bad;
}

test("no 'use client' file reaches a node: module", () => {
  const clients = walk(SRC).filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8").slice(0, 200)));
  assert.ok(clients.length > 50, "expected to find the client components");
  const problems = clients.flatMap((c) => nodeImportsReachable(c).map((b) => `${c.replace(SRC, "src")}: ${b}`));
  assert.deepEqual(problems, []);
});
