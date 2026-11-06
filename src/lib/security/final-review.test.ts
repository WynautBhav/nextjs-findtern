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

test("#3 thread payloads carry a seen flag, never the counterpart's read time", () => {
  const route = read("app/api/messages/threads/[id]/route.ts");
  assert.doesNotMatch(route, /ReadAt/);
  assert.match(route, /seen: await counterpartSeen\(viewer, thread\)/);
  assert.doesNotMatch(read("components/app/messages/inbox-server.tsx"), /ReadAt/);
  assert.doesNotMatch(read("lib/messages.ts"), /export function counterpartReadAt/);
});

test("#5/#19 project DELETE refuses a taken-down listing and clears saves; close honours takedown", () => {
  const src = read("app/api/employer/projects/[id]/route.ts");
  const del = src.slice(src.indexOf("export async function DELETE"));
  const guard = del.indexOf("if (project.takenDownAt)");
  assert.ok(guard > 0 && guard < del.indexOf("db.delete"), "takedown check runs before any delete");
  assert.match(del.slice(guard, guard + 160), /status: 409/);
  assert.match(del, /db\.delete\(schema\.internSavedProjects\)/);
  assert.match(src, /isProjectOpen\(project\.status, project\.takenDownAt\)\) \{/);
});

test("#19 shortlisting and meetings refuse a closed or taken-down listing", () => {
  for (const p of ["app/api/employer/cart/route.ts", "app/api/employer/[id]/interviews/route.ts"]) {
    const src = read(p);
    assert.match(src, /takenDownAt: schema\.projects\.takenDownAt/, p);
    assert.match(src, /if \(!isProjectOpen\(project\.status, project\.takenDownAt\)\)/, p);
  }
});

test("#8 an intern without an offer only opens a live listing of an active, real employer", () => {
  const src = read("app/intern/opportunities/[id]/page.tsx");
  assert.match(src, /if \(!existing && !\(await projectById\(id, \{ strict: true \}\)\)\) notFound\(\);/);
  const lib = read("lib/intern-data.ts");
  assert.match(lib, /and\(eq\(schema\.projects\.id, id\), eq\(schema\.employers\.isActive, true\), realEmployers\(\)\)/);
});

test("#9 0021 backs up and restores per onboarding row, not per user", () => {
  const up = readFileSync(join(SRC, "../drizzle/0021_skills_cut_seven.sql"), "utf8");
  assert.match(up, /"onboarding_id" varchar PRIMARY KEY NOT NULL/);
  assert.match(up, /ON CONFLICT \("onboarding_id"\) DO NOTHING/);
  const down = readFileSync(join(SRC, "../drizzle/rollback/0021_skills_cut_seven.down.sql"), "utf8");
  assert.equal(down.match(/b\."onboarding_id" = o\."id"/g)?.length, 2);
  assert.doesNotMatch(down, /b\."user_id" = o\."user_id"/);
});

test("#12 ConcurrencyLimiter caps open streams per key and releases once", async () => {
  const { ConcurrencyLimiter } = await import("./rate-limit.ts");
  const lim = new ConcurrencyLimiter(2);
  const a = lim.acquire("u1");
  const b = lim.acquire("u1");
  assert.ok(a && b);
  assert.equal(lim.acquire("u1"), null, "third stream refused");
  assert.ok(lim.acquire("u2"), "other users unaffected");
  a();
  a(); // double release must not free two slots
  assert.ok(lim.acquire("u1"));
  assert.equal(lim.acquire("u1"), null);
});

test("#12/#13 live stream and thread reads are rate-limited, capped and refuse banned accounts", () => {
  const live = read("app/api/live/route.ts");
  assert.match(live, /const streams = new ConcurrencyLimiter\(5\)/);
  assert.match(live, /if \(!polls\.take\(viewer\.id\)\)/);
  assert.match(live, /if \(!\(await accountActive\(viewer\)\)\) return NextResponse\.json\(\{ error: "Account inactive" \}, \{ status: 403 \}\)/);
  assert.match(live, /% RECHECK_TICKS === 0 && !\(await accountActive\(viewer\)\)\) return stop\(\)/);
  assert.equal(live.match(/release\(\);/g)?.length, 2, "released on stop and on cancel");
  const thread = read("app/api/messages/threads/[id]/route.ts");
  assert.match(thread, /if \(!reads\.take\(viewer\.id\)\)/);
  assert.match(thread, /if \(!\(await accountActive\(viewer\)\)\)/);
  const inbox = read("components/app/messages/inbox-server.tsx");
  assert.match(inbox, /if \(!thread \|\| !\(await accountActive\(viewer\)\)\) notFound\(\);/);
  assert.doesNotMatch(inbox, /await listThreads\(\{/);
});

test("#14/#15 refunds check the seat code and the student's college before using a seat", () => {
  const src = read("lib/college/refund.ts");
  const init = src.slice(src.indexOf("export async function initiateRefund"));
  assert.ok(init.indexOf("seatReviewReason(") < init.indexOf("claimSeat(d, tx, row)"), "review check runs before the seat is claimed");
  const open = src.slice(src.indexOf("export async function openRefund"), src.indexOf("export async function openRefund") + 1500);
  assert.match(open, /memberCollegeId: await memberCollegeOf\(d, db, c\.internId\)/);
  const claim = src.slice(src.indexOf("async function claimSeat"));
  assert.match(claim.slice(0, 600), /REFUND_ERRORS\.seatCodeOff/);
});
