import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(import.meta.dirname, "..", "..", p), "utf8");

test("intern role detail: without an offer, the role must pass the strict (active, real employer, live) load", () => {
  const page = read("app/intern/opportunities/[id]/page.tsx");
  assert.match(page, /if \(!existing && !\(await projectById\(id, \{ strict: true \}\)\)\) notFound\(\);/);
});

test("projectById without anyStatus filters inactive and test employers and non-live listings", () => {
  const src = read("lib/intern-data.ts");
  const fn = src.slice(src.indexOf("export async function projectById("), src.indexOf("export async function notificationsFor("));
  assert.match(fn, /: and\(eq\(schema\.projects\.id, id\), eq\(schema\.employers\.isActive, true\), realEmployers\(\)\)/);
  assert.match(fn, /return opts\.anyStatus \|\| isListingLive\(row\) \? row : null;/);
});
