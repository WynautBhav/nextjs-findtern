import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Wiring pins for the 2026-11-06 final review (no DB route harness here).
const SRC = join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("#2 TPO presence and roster progress read verified members only", () => {
  const src = read("lib/college/scope.ts");
  const snap = src.slice(src.indexOf("export async function presenceSnapshot"));
  assert.match(snap.slice(0, snap.indexOf("let rows")), /\$\{m\.status\} = 'verified'/);
  const roster = src.slice(src.indexOf("export async function tpoStudentList"));
  assert.match(roster.slice(0, roster.indexOf("AS user_id")), /\$\{m\.status\} = 'verified'/);
});
