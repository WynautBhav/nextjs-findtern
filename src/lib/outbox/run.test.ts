import assert from "node:assert/strict";
import test from "node:test";

import { driveCodeEmail, renderEmail } from "../emails.ts";
import { deriveDriveCode } from "../drives/code-derive.ts";
import { canResend, makeGuard, maskEmail, planRecipients, shapeCounts } from "./run.ts";
import { makeSender } from "./send-db.ts";
import type { OutboxRow } from "./index.ts";

const SECRET = "s".repeat(40);

test("drive code email: contains code, expiry, personal note; escapes hostile college name", () => {
  const until = new Date("2026-12-31T10:00:00Z");
  const r = renderEmail(driveCodeEmail({ name: "Asha", collegeName: `<script>alert(1)</script>"&\nBcc: x@y.z`, code: "ABCD-EFGH-JKMN", validUntil: until }));
  assert.ok(r.html.includes("ABCD-EFGH-JKMN") && r.text.includes("ABCD-EFGH-JKMN"));
  assert.ok(r.text.includes("31 December 2026"));
  assert.ok(/personal/i.test(r.text) && /activation step/.test(r.text));
  assert.ok(!r.html.includes("<script>alert") && r.html.includes("&lt;script&gt;"));
  assert.ok(!r.subject.includes("\n"));
  assert.ok(!/<img[^>]*(width="1"|height="1")/i.test(r.html));
});

test("planRecipients: needs issued code, skips queued/sent, allows dead", () => {
  const e = (id: string, codeId: string | null, st: string | null = "issued") => ({ entryId: id, email: `${id}@c.in`, codeId, codeStatus: st });
  const plan = planRecipients(
    [e("a", "c1"), e("b", null), e("c", "c3"), e("d", "c4"), e("e", "c5", "revoked"), e("f", "c6"), e("a", "c1")],
    [{ entryId: "c", status: "sent" }, { entryId: "d", status: "dead" }, { entryId: "f", status: "queued" }],
  );
  assert.deepEqual(plan.map((p) => p.entryId), ["a", "d"]);
});

test("canResend rules", () => {
  assert.equal(canResend({ status: "sent" }, []).ok, true);
  assert.equal(canResend({ status: "dead" }, []).ok, true);
  assert.equal(canResend({ status: "queued" }, []).ok, false);
  assert.equal(canResend({ status: "sent" }, [{ status: "queued" }]).ok, false);
});

test("tick guard skips overlap and releases after", async () => {
  const run = makeGuard();
  let release!: () => void;
  const first = run(() => new Promise<number>((r) => (release = () => r(1))));
  assert.deepEqual(await run(async () => 2), { skipped: true });
  release();
  assert.deepEqual(await first, { skipped: false, value: 1 });
  assert.deepEqual(await run(async () => 3), { skipped: false, value: 3 });
});

test("shapeCounts folds sending into queued and computes percent", () => {
  const c = shapeCounts([{ status: "sent", n: 6 }, { status: "queued", n: 2 }, { status: "sending", n: 1 }, { status: "dead", n: 1 }]);
  assert.deepEqual(c, { queued: 3, sent: 6, failed: 0, dead: 1, total: 10, percentDone: 70 });
  assert.equal(shapeCounts([]).percentDone, 0);
  assert.equal(maskEmail("student@college.in"), "st******@college.in".replace("******", "*****"));
});

test("sender derives the code at send time and redacts errors; no real mail", async () => {
  const sent: { to: string; text: string }[] = [];
  const row = { id: "r1", to_email: "a@c.in", template: "drive_code", payload: { codeId: "code-1" }, idempotency_key: "k:v0" } as unknown as OutboxRow;
  const lookup = async () => ({ name: "Asha", collegeName: "ABC", status: "issued", validUntil: new Date(Date.now() + 86_400_000) });
  const ok = await makeSender({ lookup, secret: () => SECRET, mail: async (m) => (sent.push(m), { ok: true, mode: "log" }) })(row);
  assert.equal(ok.providerId, "log:k:v0");
  assert.ok(sent[0].text.includes(deriveDriveCode("code-1", SECRET)));
  await assert.rejects(
    makeSender({ lookup, secret: () => SECRET, mail: async () => ({ ok: false, error: "550 rejected someone@x.com" }) })(row),
    (e: Error) => !e.message.includes("someone@x.com"),
  );
  await assert.rejects(makeSender({ lookup: async () => ({ name: "A", collegeName: "B", status: "revoked", validUntil: new Date(Date.now() + 1e6) }), secret: () => SECRET, mail: async () => ({ ok: true, mode: "log" }) })(row));
});
