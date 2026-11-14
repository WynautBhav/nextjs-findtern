import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Source-level guards for the college-code rule: a candidate learns nothing about colleges (names, ids or
 * codes) before a valid code is typed, and a code is the only way to join. These read the route files, so
 * putting a search route, a picker list or a collegeId back fails here, not in review.
 */

const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => p.slice(root.length + 1);

test("there is no public college search route", () => {
  assert.equal(existsSync(join(root, "app/api/colleges")), false, "src/app/api/colleges must not exist");
  for (const f of walk(root)) {
    const s = strip(readFileSync(f, "utf8"));
    assert.ok(!s.includes("/api/colleges"), `${rel(f)} calls /api/colleges`);
    assert.ok(!/\bsearchColleges\b/.test(s), `${rel(f)} uses searchColleges`);
  }
});

test("only the code lookup, the staff pages and the importers read colleges.code", () => {
  const allowed = [/^lib\/college\/membership\.ts$/, /^app\/admin\//, /^app\/api\/admin\//, /^app\/college\//, /^lib\/college\/scope\.ts$/, /^lib\/db\//];
  for (const f of walk(root)) {
    const r = rel(f);
    if (allowed.some((a) => a.test(r))) continue;
    assert.ok(!/colleges\.code\b/.test(strip(readFileSync(f, "utf8"))), `${r} reads colleges.code`);
  }
});

test("an intern's college shape (the only thing an intern route returns) carries no code, no list", () => {
  const m = strip(read("lib/college/membership.ts"));
  const type = m.slice(m.indexOf("export type MyCollege"), m.indexOf("};", m.indexOf("export type MyCollege")));
  assert.ok(!/\bcode\b/.test(type), "MyCollege must not carry the college code");
  assert.ok(!/export async function \w*[Ss]earch/.test(m));
});

test("joining takes a code, never an id or a name, and spends an attempt before looking", () => {
  const route = strip(read("app/api/intern/college/route.ts"));
  const body = route.slice(route.indexOf("const bodySchema"), route.indexOf("export async function GET"));
  assert.match(body, /code: z\.string/);
  assert.match(body, /\.strict\(\)/);
  assert.ok(!/collegeId|college_id|slug|name:/.test(body), "the body must not be able to name a college");
  assert.ok(route.indexOf("takeCodeAttempt") > -1 && route.indexOf("takeCodeAttempt") < route.indexOf("joinCollegeByCode("), "throttle first");
  assert.ok(route.includes("clientIp"), "per-address limit");
  assert.ok(route.includes("maskCode") && !/codeMask:\s*parsed\.data\.code\b/.test(route), "audit logs a masked code only");
  assert.ok(!/meta:[^}]*code:\s*parsed/.test(route), "the whole code is never logged");
  const m = strip(read("lib/college/membership.ts"));
  assert.ok(!/export async function joinCollege\(/.test(m), "the id-based join is gone");
  // One generic failure for every kind of miss.
  const find = m.slice(m.indexOf("export async function findCollegeByCode"), m.indexOf("export async function joinCollegeByCode"));
  assert.match(find, /isActive && college\.isPartner \? college : null/);
});

test("onboarding never trusts a client-sent college flag", () => {
  const route = strip(read("app/api/intern/onboarding/route.ts"));
  assert.match(route, /accountType: z\.enum\(\["individual", "college", ""\]\)/);
  assert.ok(route.includes("hasCodeVerifiedMembership"), "college is checked against the membership");
  assert.ok(!/collegeVerified:\s*(body|input)\b/.test(route), "collegeVerified comes from the database");
});
