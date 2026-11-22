import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { studentCallOpen } = await import("../college/access.ts");

const APP = join(import.meta.dirname, "../../app");
const LIB = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");
const lib = (p: string) => readFileSync(join(LIB, p), "utf8");

// No DB route harness here, so these pin the lock and check wiring of three write races.

// 1. Withdraw / edit vs order creation: both take the order route's lock, then re-read the open orders inside it.
const STATUS = read("api/proposals/[id]/status/route.ts");
const EDIT = read("api/proposals/[id]/route.ts");
const ORDER = read("api/employer/[id]/payment/razorpay/order/route.ts");

test("the order route and the expiry sweep lock on employer-pay:<employerId>", () => {
  assert.match(ORDER, /withLock\(`employer-pay:\$\{employerId\}`/);
  assert.match(lib("proposal-expiry-db.ts"), /withLock\(`employer-pay:\$\{employerId\}`/);
});

test("a withdraw runs under the same lock and re-checks the open order on the locked transaction", () => {
  assert.match(STATUS, /const lockedWithdraw = status === "withdrawn";/);
  assert.match(STATUS, /withLock\(`employer-pay:\$\{proposal\.employerId\}`, fn\)/);
  const body = STATUS.slice(STATUS.indexOf("const updated = await run("));
  // The open-order read is the first thing inside the lock, before any row lock (same order as the order route and sweep).
  const check = body.indexOf("openOrderProposalIds(tx, proposal.employerId)");
  const rowLock = body.indexOf('.for("update")');
  assert.ok(check > 0 && rowLock > check, "open-order re-check inside the lock, before the row locks");
  assert.match(STATUS, /if \(updated === "paying"\)[^\n]*\n[^\n]*status: 409/);
});

test("reopening an accepted offer by edit runs under the same lock and re-checks the open order inside it", () => {
  assert.match(EDIT, /reopen \? await withLock\(`employer-pay:\$\{proposal\.employerId\}`, write\)/);
  const write = EDIT.slice(EDIT.indexOf("const write = async (tx: Tx)"), EDIT.indexOf("const updated = reopen"));
  assert.match(write, /reopen && \(await openOrderProposalIds\(tx, proposal\.employerId\)\)\.has\(proposal\.id\)/);
  assert.match(write, /await tx\s*\.update\(schema\.proposals\)/);
  assert.match(EDIT, /if \(updated === "paying"\)[^\n]*\n[^\n]*status: 409/);
});

// 2. A revoked or ended drive closes its calls for the student.
const NOW = new Date("2026-11-10T10:00:00Z").getTime();
const HOUR = 3600_000;
const live = { startsAt: new Date(NOW - HOUR), endsAt: new Date(NOW + HOUR), revokedAt: null as Date | null };
const member = { leftAt: null as Date | null };

test("a call is open only in a live drive of an active college the student is still in", () => {
  assert.equal(studentCallOpen({ drive: live, collegeActive: true, membership: member, now: NOW }), true);
  assert.equal(studentCallOpen({ drive: { ...live, revokedAt: new Date(NOW - 1000) }, collegeActive: true, membership: member, now: NOW }), false);
  assert.equal(studentCallOpen({ drive: { ...live, endsAt: new Date(NOW - 1000) }, collegeActive: true, membership: member, now: NOW }), false);
  assert.equal(studentCallOpen({ drive: live, collegeActive: false, membership: member, now: NOW }), false);
  assert.equal(studentCallOpen({ drive: live, collegeActive: true, membership: null, now: NOW }), false);
  assert.equal(studentCallOpen({ drive: live, collegeActive: true, membership: { leftAt: new Date(NOW - 1000) }, now: NOW }), false);
});

test("the student's call list and the accept route both refuse a closed drive's call", () => {
  const meetings = lib("college/meetings.ts");
  const list = meetings.slice(meetings.indexOf("export async function meetingsForStudent"));
  assert.match(list, /\.filter\(\(r\) => callRowOpen\(r, now\)\)/);
  // The membership join is to the drive's own college, so a student who moved college is not a member of it.
  assert.match(meetings, /eq\(schema\.collegeMemberships\.collegeId, schema\.collegeDrives\.collegeId\)/);
  const accept = read("api/intern/college/meetings/[id]/route.ts");
  assert.match(accept, /studentCall\(guard\.session\.uid, id\)/);
  assert.match(accept, /if \(!call\.open \|\| effectiveStatus\(m\) !== "requested"\)/);
  // The update still only moves a row that is "requested", so a revoke that cancelled it first wins.
  assert.match(accept, /eq\(schema\.collegeDriveMeetings\.status, "requested"\)/);
});

test("revoking a drive closes its open calls in the same transaction", () => {
  const link = read("api/college/drives/[id]/link/route.ts");
  const del = link.slice(link.indexOf("export async function DELETE"));
  assert.match(del, /transaction\(async \(tx\) => \{[\s\S]*revokedAt: new Date\(\)[\s\S]*closeDriveCalls\(tx, drive\.id\)/);
  const meetings = lib("college/meetings.ts");
  const close = meetings.slice(meetings.indexOf("export async function closeDriveCalls"), meetings.indexOf("export async function meetingsForStudent"));
  assert.match(close, /status: "cancelled"/);
  assert.match(close, /inArray\(schema\.collegeDriveMeetings\.status, \["requested", "accepted"\]\)/);
});

// 3. Full-time offers follow the internship proposals route's candidate rules on both paths.
test("a full-time offer refuses an inactive, frozen or held-elsewhere candidate on both paths", () => {
  const route = read("api/employer/[id]/full-time-offer/route.ts");
  // After the placement / drive branches, before the offer is written: applies to both.
  const shared = route.slice(route.indexOf("from = { driveId: loaded.drive.id"), route.indexOf("const proposal = await withLock"));
  assert.match(shared, /candidate\.role !== "intern" \|\| !candidate\.isActive/);
  assert.match(shared, /if \(candidate\.frozenAt\) return NextResponse\.json\(ON_HOLD_REFUSAL, \{ status: 409 \}\)/);
  assert.match(shared, /heldElsewhereIds\(db, id, \[base\.internId\]\)\)\.has\(base\.internId\)/);
  assert.match(shared, /NextResponse\.json\(CANDIDATE_UNAVAILABLE, \{ status: 409 \}\)/);
  // The same rule the proposals route applies.
  assert.match(read("api/employer/[id]/proposals/route.ts"), /heldElsewhereIds\(db, id, \[b\.internId\]\)\)\.has\(b\.internId\)/);
});
