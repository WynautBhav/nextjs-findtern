import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

/**
 * No hard-coded price outside the pricing config. A figure that is typed into code instead of read from
 * `lib/pricing-config.ts` stops following the admin's edit, so this fails when one is put back.
 *
 * Scans src/**\/*.{ts,tsx} (tests excluded) for the published figures as numbers or as rupee text. Whole-line
 * comments are ignored; a line naming LEGACY_PER_HIRE_MINOR is the frozen fee of offers older than the snapshot.
 */

const SRC = resolve(import.meta.dirname, "..");
const LITERALS = /\b(?:500000|500_000|800_000|800000|1_500_000|1500000|249900|249_900)\b|₹5,000|₹8,000|₹15,000|₹2,499|₹100\/hr|₹200\/hr/;

/** Allowed for good: the config itself, legal and long-form copy (edited by hand, listed by the copy audit), and one unrelated byte limit. */
const ALLOWED = [
  /^lib\/pricing-config\.ts$/,
  /^lib\/content\/legal[^/]*\.ts$/,
  /^lib\/content\/faq\.ts$/,
  /^lib\/content\/blog\.ts$/,
  // 1.5 MB cap on an inline CMS image: a byte count, not a price.
  /^lib\/admin\/cms-collections\.ts$/,
];


function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) yield full;
  }
}

/** The lines of a file that are code, i.e. not inside a block comment and not a whole-line `//` comment. */
function codeLines(text: string): { text: string; n: number }[] {
  let inBlock = false;
  const out: { text: string; n: number }[] = [];
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    const wasInBlock = inBlock;
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
    } else if (t.startsWith("/*")) {
      inBlock = !t.includes("*/");
    }
    if (wasInBlock || t.startsWith("/*") || t.startsWith("//")) return;
    out.push({ text: line, n: i + 1 });
  });
  return out;
}

function literalHits(): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const file of sources(SRC)) {
    const rel = relative(SRC, file).split("\\").join("/");
    const found = codeLines(readFileSync(file, "utf8"))
      .filter(({ text }) => LITERALS.test(text) && !text.includes("LEGACY_PER_HIRE_MINOR"))
      .map(({ text, n }) => `${rel}:${n}: ${text.trim().slice(0, 100)}`);
    if (found.length) hits.set(rel, found);
  }
  return hits;
}

test("no price literal outside the config and the allowlist", () => {
  const stray = [...literalHits()].filter(([rel]) => !ALLOWED.some((a) => a.test(rel))).flatMap(([, lines]) => lines);
  assert.deepEqual(stray, [], "read the figure from lib/pricing-config.ts (server: getPricingConfig, client: usePricingConfig) instead of typing it");
});

test("no client component reads the hard-coded bands (useRegionBands is gone; use usePricingBands)", () => {
  const users: string[] = [];
  for (const file of sources(SRC)) {
    if (/\buseRegionBands\b/.test(readFileSync(file, "utf8"))) users.push(relative(SRC, file).split("\\").join("/"));
  }
  assert.deepEqual(users, []);
});
