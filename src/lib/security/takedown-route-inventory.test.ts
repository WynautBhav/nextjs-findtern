import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Route inventory for the takedown lockdown. While admin has a project taken down, the owning employer can only view it
 * and contact admin, so every employer-callable route that changes something belonging to a project must ask the shared
 * guard (src/lib/projects/takedown-guard-server.ts) BEFORE its first write. A route that is not project-scoped is listed
 * in ALLOWED with the reason. A new employer mutating route that is in neither place fails this test: that is the point.
 *
 * Scans every route.ts under src/app/api except admin/ (admin is never limited by the guard). Employer-callable means the
 * path starts with employer/ or the file names "employer" in a `roles: [...]` array.
 */

const API = join(import.meta.dirname, "../../app/api");
const GUARD_CALL = /\bassert(Project|Proposal|Interview|Timesheet|CartItem|Projects)Actionable\(/;
const WRITES = /\.(insert|update|delete)\(|\bwithLock\(|\.transaction\(/;

/** Mutating, employer-callable routes the guard is NOT applied to, and why. Key: path under src/app/api. */
const ALLOWED: Record<string, string> = {
  "employer/[id]/route.ts": "company profile (PATCH); not tied to a project",
  "employer/[id]/change-password/route.ts": "the employer's own password; not tied to a project",
  "employer/[id]/international-fte/route.ts": "company-level International FTE application; not tied to a project",
  "employer/[id]/projects/route.ts": "creates a NEW project owned by the employer; there is no existing project to be taken down",
  "employer/[id]/payment/cancel/route.ts": "closes the employer's own unpaid order: releases a hold, moves no money; refusing would strand an open order",
  "employer/[id]/payment/razorpay/verify/route.ts": "records a payment the gateway already captured (money committed, never undone by a takedown); the webhook settles the same way; opening an order, the gate, is guarded",
  "employer/drives/[id]/meetings/route.ts": "college-drive meetings; scoped to a drive, not a project",
  "employer/drives/[id]/shortlist/route.ts": "college-drive shortlist; scoped to a drive, not a project",
  "drives/join/route.ts": "joins a college drive by code; not a project",
  "employer/projects/[id]/contact-admin/route.ts": "THE allowed action on a taken-down project: contact admin",
  "support/feedback/route.ts": "in-app 'Report a problem'; the other way to reach admin",
  "notifications/[id]/read/route.ts": "marks the user's own notification read",
  "notifications/prefs/route.ts": "the user's own notification preferences",
  "notifications/read-all/route.ts": "marks the user's own notifications read",
  "presence/heartbeat/route.ts": "presence ping; not project data",
  "terms/accept/route.ts": "accepts the platform terms; not project data",
  "uploads/route.ts": "file upload session; attaches to nothing until a guarded route references the file",
  "threads/[id]/read/route.ts": "read receipts on a thread; the send route (guarded for project threads) is the action",
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f === "route.ts" ? [p] : [];
  });

type Row = { route: string; methods: string[]; mutating: boolean; employerCallable: boolean; guarded: boolean; allowed: string | null; guardBeforeWrite: boolean };

const rows: Row[] = walk(API)
  .map((abs) => ({ abs, route: relative(API, abs).replaceAll("\\", "/") }))
  .filter(({ route }) => !route.startsWith("admin/"))
  .map(({ abs, route }) => {
    const src = readFileSync(abs, "utf8");
    const methods = [...src.matchAll(/export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
    const rolesLists = [...src.matchAll(/roles:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    const employerCallable = route.startsWith("employer/") || rolesLists.some((r) => r.includes('"employer"'));
    // Only the mutating handler counts: a GET above it may update a read marker, a helper may write once called.
    const from = Math.max(0, src.search(/export (?:async function|const) (?:POST|PUT|PATCH|DELETE)\b/));
    const guardAt = src.search(GUARD_CALL);
    const writeAt = src.slice(from).search(WRITES) < 0 ? -1 : from + src.slice(from).search(WRITES);
    return {
      route,
      methods,
      mutating: methods.some((m) => m !== "GET"),
      employerCallable,
      guarded: guardAt >= 0,
      allowed: ALLOWED[route] ?? null,
      // The first write in the file comes after the guard call (a helper above POST that writes would fail this; none should).
      guardBeforeWrite: guardAt >= 0 && (writeAt < 0 || guardAt < writeAt),
    };
  })
  .filter((r) => r.employerCallable && r.methods.length > 0)
  .sort((a, b) => a.route.localeCompare(b.route));

test("inventory finds the employer routes (sanity: the scan is not empty)", () => {
  assert.ok(rows.length >= 20, `found ${rows.length} employer-callable routes`);
  assert.ok(rows.some((r) => r.route === "employer/cart/route.ts"));
  assert.ok(rows.some((r) => r.route === "proposals/[id]/status/route.ts"));
  assert.ok(rows.some((r) => r.route === "timesheets/[id]/decision/route.ts"));
});

for (const r of rows.filter((x) => x.mutating)) {
  const label = `${r.route} [${r.methods.filter((m) => m !== "GET").join(",")}]`;
  if (r.allowed) {
    test(`${label} is allowlisted as not project-scoped (${r.allowed.slice(0, 60)})`, () => {
      assert.ok(r.allowed!.length >= 20, "an allowlist entry needs a real justification");
      assert.equal(r.guarded, false, "allowlisted but it calls the guard: remove it from ALLOWED");
    });
  } else {
    test(`${label} asks the takedown guard before its first write`, () => {
      assert.ok(r.guarded, `${r.route} is employer-callable and mutating but never calls assert*Actionable(); guard it or add it to ALLOWED with a reason`);
      assert.ok(r.guardBeforeWrite, `${r.route} writes before it asks the takedown guard`);
    });
  }
}

test("every ALLOWED entry is a real employer-callable mutating route (no stale entries)", () => {
  const live = new Set(rows.filter((r) => r.mutating).map((r) => r.route));
  for (const k of Object.keys(ALLOWED)) assert.ok(live.has(k), `ALLOWED has ${k} but no such employer-callable mutating route exists`);
});

test("the guard is never applied to an admin route (admin can always restore and edit)", () => {
  const adminRoutes = walk(join(API, "admin"));
  assert.ok(adminRoutes.length > 0);
  for (const abs of adminRoutes) assert.doesNotMatch(readFileSync(abs, "utf8"), GUARD_CALL, relative(API, abs));
});

test("routes that run for admin or intern as well only apply the guard to an employer caller", () => {
  for (const p of ["proposals/[id]/route.ts", "proposals/[id]/status/route.ts", "timesheets/[id]/decision/route.ts", "threads/[id]/messages/route.ts"]) {
    const src = readFileSync(join(API, p), "utf8");
    assert.match(src, /role (===|!==) "(employer|admin)"[\s\S]{0,200}Actionable\(|if \(session\.role[^\n]*\{\n\s*const td = await assert/, `${p} must gate the guard on the employer role`);
  }
});

test("optional: write the inventory table when INVENTORY_OUT is set", () => {
  if (!process.env.INVENTORY_OUT) return;
  const lines = rows.map((r) => `| ${r.route} | ${r.methods.join(",")} | ${r.mutating ? (r.guarded ? "yes" : "no (allowlisted)") : "n/a (read-only)"} | ${r.allowed ?? ""} |`);
  writeFileSync(process.env.INVENTORY_OUT, ["| route | methods | guarded | reason if not |", "|---|---|---|---|", ...lines].join("\n") + "\n");
});
