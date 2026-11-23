import assert from "node:assert/strict";
import test from "node:test";

import type { PgClient } from "../db/pg-tx.ts";
import { createLeaveRequestIn, decideLeaveRequestIn } from "./leave-request-db.ts";

/** A tiny in-memory stand-in for the three tables the leave flow touches, driven by the SQL text. */
type Req = { id: string; user_id: string; college_id: string; membership_id: string; status: string; reason: string | null; decided_by_type?: string; decided_by_id?: string; decision_note?: string | null };
type Mem = { id: string; user_id: string; college_id: string; left_at: Date | null };

function world(opts: { members?: Mem[]; requests?: Req[] } = {}) {
  const members = opts.members ?? [{ id: "m1", user_id: "u1", college_id: "c1", left_at: null }];
  const requests = opts.requests ?? [];
  const log: string[] = [];
  const audit: unknown[][] = [];
  let seq = 0;
  const r = (rows: Record<string, unknown>[] = [], rowCount = rows.length) => ({ rows, rowCount });
  const client = {
    async query(sql: string, p: unknown[] = []) {
      log.push(sql);
      if (sql.startsWith("SELECT m.id, m.college_id, m.left_at, c.name")) {
        const m = members.find((x) => x.user_id === p[0] && !x.left_at);
        return r(m ? [{ ...m, college_name: "NIT" }] : []);
      }
      if (sql.startsWith("SELECT id FROM college_leave_requests WHERE user_id")) return r(requests.filter((x) => x.user_id === p[0] && x.status === "requested").map((x) => ({ id: x.id })));
      if (sql.startsWith("INSERT INTO college_leave_requests")) {
        if (requests.some((x) => x.user_id === p[0] && x.status === "requested")) throw Object.assign(new Error("dup"), { code: "23505" });
        const row: Req = { id: `r${++seq}`, user_id: String(p[0]), college_id: String(p[1]), membership_id: String(p[2]), status: "requested", reason: p[3] as string | null };
        requests.push(row);
        return r([{ id: row.id }]);
      }
      if (sql.startsWith("SELECT id, user_id, college_id, membership_id, status FROM college_leave_requests")) {
        const scoped = sql.includes("AND college_id = $2");
        return r(requests.filter((x) => x.id === p[0] && (!scoped || x.college_id === p[1])));
      }
      if (sql.startsWith("SELECT id, college_id, left_at FROM college_memberships")) return r(members.filter((x) => x.user_id === p[0]));
      if (sql.startsWith("UPDATE college_memberships SET left_at")) {
        const m = members.find((x) => x.user_id === p[0] && !x.left_at);
        if (m) m.left_at = new Date();
        return r([], m ? 1 : 0);
      }
      if (sql.startsWith("UPDATE college_leave_requests SET status = $2")) {
        const x = requests.find((q) => q.id === p[0])!;
        Object.assign(x, { status: p[1], decided_by_type: p[2], decided_by_id: p[3], decision_note: p[4] });
        return r([], 1);
      }
      if (sql.startsWith("UPDATE college_leave_requests SET status = 'cancelled'")) {
        requests.find((q) => q.id === p[0])!.status = "cancelled";
        return r([], 1);
      }
      if (sql.startsWith("INSERT INTO college_audit_log")) {
        audit.push(p);
        return r([], 1);
      }
      return r([], 1);
    },
  };
  return { client: client as unknown as PgClient, members, requests, log, audit };
}

const ended = (log: string[]) => log.some((s) => s.startsWith("UPDATE college_memberships SET left_at"));
const officer = { type: "college_admin" as const, id: "tpo1" };

test("filing a request writes a pending row and does NOT end the membership", async () => {
  const w = world();
  const out = await createLeaveRequestIn(w.client, "u1", "moving cities");
  assert.equal(out.ok, true);
  assert.equal(w.requests.length, 1);
  assert.equal(w.requests[0].status, "requested");
  assert.equal(w.requests[0].reason, "moving cities");
  assert.equal(w.members[0].left_at, null);
  assert.ok(!ended(w.log));
});

test("D4: a request with no reason is fine", async () => {
  const w = world();
  assert.equal((await createLeaveRequestIn(w.client, "u1", null)).ok, true);
  assert.equal(w.requests[0].reason, null);
});

test("a second pending request is refused; a non-member cannot ask", async () => {
  const w = world();
  await createLeaveRequestIn(w.client, "u1", null);
  const again = await createLeaveRequestIn(w.client, "u1", null);
  assert.equal(again.ok, false);
  assert.equal(!again.ok && again.code, "already_requested");
  const none = await createLeaveRequestIn(world({ members: [] }).client, "u1", null);
  assert.equal(!none.ok && none.code, "not_member");
});

test("approve ends the membership once, closes the request and writes an audit row", async () => {
  const w = world();
  await createLeaveRequestIn(w.client, "u1", null);
  const out = await decideLeaveRequestIn(w.client, { actor: officer, collegeId: "c1", requestId: "r1", action: "approve", note: "ok" });
  assert.equal(out.ok && out.status, "approved");
  assert.ok(w.members[0].left_at instanceof Date);
  assert.equal(w.requests[0].status, "approved");
  assert.equal(w.requests[0].decided_by_type, "college_admin");
  assert.ok(w.log.some((s) => s.startsWith("DELETE FROM college_presence")));
  assert.ok(w.log.some((s) => s.includes("'accountType', 'individual'")));
  assert.ok(w.audit.some((a) => a[3] === "leave_request.approved"));
  // Deciding again is a no-op: no second membership write.
  const before = w.log.filter((s) => s.startsWith("UPDATE college_memberships SET left_at")).length;
  const repeat = await decideLeaveRequestIn(w.client, { actor: officer, collegeId: "c1", requestId: "r1", action: "approve", note: null });
  assert.equal(repeat.ok && repeat.already, true);
  assert.equal(w.log.filter((s) => s.startsWith("UPDATE college_memberships SET left_at")).length, before);
});

test("reject keeps the membership (the TPO's note is stored)", async () => {
  const w = world();
  await createLeaveRequestIn(w.client, "u1", null);
  const out = await decideLeaveRequestIn(w.client, { actor: officer, collegeId: "c1", requestId: "r1", action: "reject", note: "finish the drive first" });
  assert.equal(out.ok && out.status, "rejected");
  assert.equal(w.members[0].left_at, null);
  assert.ok(!ended(w.log));
  assert.equal(w.requests[0].decision_note, "finish the drive first");
});

test("D1: after a rejection the student can file a new request right away, and the history stays", async () => {
  const w = world();
  await createLeaveRequestIn(w.client, "u1", "first");
  await decideLeaveRequestIn(w.client, { actor: officer, collegeId: "c1", requestId: "r1", action: "reject", note: null });
  const second = await createLeaveRequestIn(w.client, "u1", "second");
  assert.equal(second.ok, true);
  assert.deepEqual(w.requests.map((x) => x.status), ["rejected", "requested"]);
});

test("the opposite decision on a decided request is a 409 and changes nothing", async () => {
  const w = world();
  await createLeaveRequestIn(w.client, "u1", null);
  await decideLeaveRequestIn(w.client, { actor: officer, collegeId: "c1", requestId: "r1", action: "reject", note: null });
  const out = await decideLeaveRequestIn(w.client, { actor: officer, collegeId: "c1", requestId: "r1", action: "approve", note: null });
  assert.equal(!out.ok && out.status, 409);
  assert.equal(w.members[0].left_at, null);
});

test("a TPO cannot decide another college's request (404) and nothing is written", async () => {
  const w = world();
  await createLeaveRequestIn(w.client, "u1", null);
  const out = await decideLeaveRequestIn(w.client, { actor: { type: "college_admin", id: "tpo2" }, collegeId: "c2", requestId: "r1", action: "approve", note: null });
  assert.equal(!out.ok && out.status, 404);
  assert.equal(w.members[0].left_at, null);
  assert.equal(w.requests[0].status, "requested");
});

test("D3: a Findtern admin (no college scope) approves through the same path and is recorded as admin", async () => {
  const w = world();
  await createLeaveRequestIn(w.client, "u1", null);
  const out = await decideLeaveRequestIn(w.client, { actor: { type: "admin", id: "adm1" }, collegeId: null, requestId: "r1", action: "approve", note: null });
  assert.equal(out.ok && out.status, "approved");
  assert.equal(w.requests[0].decided_by_type, "admin");
  assert.equal(w.requests[0].decided_by_id, "adm1");
  assert.ok(w.members[0].left_at instanceof Date);
});

test("approving a request whose student already left closes it without touching anything", async () => {
  const w = world();
  await createLeaveRequestIn(w.client, "u1", null);
  w.members[0].left_at = new Date();
  const out = await decideLeaveRequestIn(w.client, { actor: officer, collegeId: "c1", requestId: "r1", action: "approve", note: null });
  assert.equal(!out.ok && out.code, "not_member");
  assert.equal(w.requests[0].status, "cancelled");
});

test("INT-05: approving a leave also closes the student's open drive meet requests and accepted calls (as a drive revoke does)", async () => {
  const w = world({ requests: [{ id: "r1", user_id: "u1", college_id: "c1", membership_id: "m1", status: "requested", reason: null }] });
  await decideLeaveRequestIn(w.client, { actor: officer, collegeId: "c1", requestId: "r1", action: "approve", note: null });
  const close = w.log.find((s) => s.startsWith("UPDATE college_drive_meetings"));
  assert.ok(close, "no UPDATE college_drive_meetings was run");
  assert.match(close!, /status = 'cancelled'/);
  assert.match(close!, /status IN \('requested', 'accepted'\)/);
  assert.match(close!, /user_id = \$1/);
});

test("INT-05: declining a leave leaves the student's meets alone", async () => {
  const w = world({ requests: [{ id: "r1", user_id: "u1", college_id: "c1", membership_id: "m1", status: "requested", reason: null }] });
  await decideLeaveRequestIn(w.client, { actor: officer, collegeId: "c1", requestId: "r1", action: "decline", note: null });
  assert.ok(!w.log.some((s) => s.startsWith("UPDATE college_drive_meetings")));
});
