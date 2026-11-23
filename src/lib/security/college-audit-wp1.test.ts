import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * WP1 (authorisation) source guards. They read the route files, so a new college or admin-college route that
 * forgets the guard, or a sign-in route that drops the address ceiling, fails here and not in review.
 * The behaviour behind them is exercised against a running build by e2e/college-audit/wp1-authz.mjs.
 */

const root = join(import.meta.dirname, "..", "..");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p: string) => strip(readFileSync(join(root, p), "utf8"));

function routes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const p = join(dir, name);
    if (statSync(join(root, p)).isDirectory()) routes(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

/** The body of `export async function METHOD(...) { ... }`, up to the next exported handler or the end of the file. */
function handlers(src: string): { method: string; body: string }[] {
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;
  const hits = [...src.matchAll(re)];
  return hits.map((m, i) => ({ method: m[1], body: src.slice(m.index!, hits[i + 1]?.index ?? src.length) }));
}

test("every /api/college handler runs the college guard first: writes requireCollegeMutation, reads requireCollegeRead", () => {
  const files = routes("app/api/college");
  assert.ok(files.length >= 14, `expected the college routes, found ${files.length}`);
  for (const f of files) {
    for (const h of handlers(read(f))) {
      const guard = h.method === "GET" ? "requireCollegeRead" : "requireCollegeMutation";
      const at = h.body.indexOf(guard);
      assert.ok(at > 0, `${f} ${h.method} does not call ${guard}`);
      // nothing that reads the body or the database may come before the guard
      const before = h.body.slice(0, at);
      assert.ok(!/req\.json\(|getDb\(|await params|ctx\.params/.test(before), `${f} ${h.method} touches input or the database before ${guard}`);
    }
  }
});

test("no /api/college route takes the college id from the request", () => {
  for (const f of routes("app/api/college")) {
    const s = read(f);
    assert.ok(!/searchParams\.get\(["'](college|collegeId|college_id)["']\)/.test(s), `${f} reads a college id from the query`);
    assert.ok(!/body\.collegeId|parsed\.data\.collegeId|\.collegeId\s*[:=]\s*(body|parsed)/.test(s), `${f} reads a college id from the body`);
  }
});

test("every /api/admin/colleges and drive-order mutation is requireMutation for admins; reads check role admin", () => {
  const files = [...routes("app/api/admin/colleges"), ...routes("app/api/admin/drive-orders"), ...routes("app/api/admin/imports"), ...routes("app/api/admin/identity-reviews"), "app/api/admin/drive-overview/route.ts"];
  assert.ok(files.length >= 20, `expected the admin college routes, found ${files.length}`);
  for (const f of files) {
    for (const h of handlers(read(f))) {
      if (h.method === "GET") {
        assert.ok(/session\.role\s*!==\s*"admin"|requireAdminRead|roles:\s*\["admin"\]/.test(h.body) || /getSession\(\)/.test(h.body), `${f} GET has no session check`);
        continue;
      }
      assert.ok(/requireMutation\(\{[^}]*roles:\s*\["admin"\]/.test(h.body), `${f} ${h.method} is not requireMutation({ roles: ["admin"] })`);
    }
  }
});

test("college sign-in has the same address ceiling as the other three sign-ins (QA-138), and the three code routes charge before they look", () => {
  for (const f of ["app/api/auth/login/route.ts", "app/api/auth/employer/login/route.ts", "app/api/auth/admin/login/route.ts", "app/api/auth/college/login/route.ts"]) {
    assert.ok(/takeAuth\(limiters\.login,/.test(read(f)), `${f} does not use takeAuth(limiters.login, ...)`);
  }
  for (const f of ["app/api/intern/college/route.ts", "app/api/intern/college-promo/route.ts"]) {
    const s = read(f);
    const at = s.indexOf("takeCodeAttempt({");
    const lookup = s.search(/await (findCollegeByCode|redeemCollegePromo|joinCollegeByCode)\(/);
    assert.ok(at > 0 && lookup > 0 && at < lookup, `${f} charges the attempt after the lookup`);
  }
});

test("drive share links: the token is read once from the URL, never logged, and the landing page sends no referrer", () => {
  const page = readFileSync(join(root, "app/drive/[token]/page.tsx"), "utf8");
  assert.ok(/referrer:\s*"no-referrer"/.test(page), "drive landing page must set referrer no-referrer");
  assert.ok(/robots:\s*\{[^}]*index:\s*false/.test(page), "drive landing page must not be indexed");
  for (const f of ["app/api/drives/join/route.ts", "app/api/college/drives/[id]/link/route.ts", "app/api/college/drives/route.ts"]) {
    assert.ok(!/console\.(log|info|warn|error)\([^)]*token/i.test(read(f)), `${f} logs a token`);
  }
});
