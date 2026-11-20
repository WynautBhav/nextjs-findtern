import { test } from "node:test";
import assert from "node:assert/strict";

import { acknowledgeWarning, applyAccountAction, type Notice, type StandingDeps, type StandingInput } from "./standing-service.ts";
import type { StrikeEntry } from "./strikes.ts";

/** An in-memory account and a fake mailer: the same service the routes call, no database, nothing sent. */
function world(opts: { frozen?: boolean; history?: StrikeEntry[]; missing?: boolean } = {}) {
  const state = { frozen: opts.frozen ?? false, frozenReason: null as string | null, history: [...(opts.history ?? [])], audits: [] as { action: string; meta: Record<string, unknown> }[], mails: [] as { key: string; notice: Notice }[], holds: [] as string[], strikes: 0 };
  const deps: StandingDeps = {
    now: () => new Date("2026-11-20T10:00:00Z"),
    async transaction(_subject, fn) {
      if (opts.missing) return null;
      return fn({
        state: { name: "Asha", frozen: state.frozen, history: state.history },
        async insertStrike(r) { const id = `s${++state.strikes}`; state.history.push({ id, kind: r.kind, acknowledgedAt: null }); return id; },
        async setFrozen(at, reason) { state.frozen = at !== null; state.frozenReason = reason; },
        async audit(e) { state.audits.push(e); },
      });
    },
    async notify(_to, n, key) { state.mails.push({ key, notice: n }); },
    async afterHoldChange(_s, change) { state.holds.push(change); },
  };
  return { state, deps };
}

const base: StandingInput = { subject: { type: "intern", id: "u1" }, adminId: "a1", action: "violation", reason: "off_platform_contact", evidenceNote: "Shared a phone number at 12:03 in the call", expectedViolations: 0 };

test("first confirmed violation warns: strike, audit, one email, no freeze", async () => {
  const { state, deps } = world();
  const out = await applyAccountAction(deps, base);
  assert.ok(out.ok && out.effect === "warn");
  assert.equal(state.frozen, false);
  assert.deepEqual(state.audits.map((a) => a.action), ["account.warn"]);
  assert.equal(state.mails.length, 1);
  assert.equal(state.mails[0].notice.type, "account_warning");
  assert.deepEqual(state.holds, []);
});

test("second confirmed violation freezes: login block flag set, audit, freeze email, other side told", async () => {
  const { state, deps } = world({ history: [{ id: "s0", kind: "warning", acknowledgedAt: "2026-11-01" }] });
  const out = await applyAccountAction(deps, { ...base, expectedViolations: 1 });
  assert.ok(out.ok && out.effect === "freeze");
  assert.equal(state.frozen, true);
  assert.equal(state.frozenReason, "off_platform_contact");
  assert.deepEqual(state.audits.map((a) => a.action), ["account.freeze"]);
  assert.equal(state.mails[0].notice.type, "account_frozen");
  assert.deepEqual(state.holds, ["held"]);
});

test("re-clicking Warn changes nothing (stale count): no second strike, no second email", async () => {
  const { state, deps } = world();
  await applyAccountAction(deps, base);
  const again = await applyAccountAction(deps, base);
  assert.ok(again.ok && again.effect === "none" && again.why === "stale");
  assert.equal(state.strikes, 1);
  assert.equal(state.mails.length, 1);
  assert.equal(state.audits.length, 1);
});

test("a direct freeze from a clean account is allowed and audited", async () => {
  const { state, deps } = world();
  const out = await applyAccountAction(deps, { ...base, action: "freeze" });
  assert.ok(out.ok && out.effect === "freeze");
  assert.equal(state.frozen, true);
  assert.equal(state.audits[0].action, "account.freeze");
});

test("unfreeze restores access, is audited, emails once, and twice is a no-op", async () => {
  const { state, deps } = world({ frozen: true, history: [{ id: "s0", kind: "warning" }, { id: "s1", kind: "freeze" }] });
  const un = { ...base, action: "unfreeze" as const, reason: "contacted_admin", expectedViolations: undefined };
  const out = await applyAccountAction(deps, un);
  assert.ok(out.ok && out.effect === "unfreeze");
  assert.equal(state.frozen, false);
  assert.equal(state.frozenReason, null);
  assert.equal(state.audits[0].action, "account.unfreeze");
  assert.equal(state.mails[0].notice.type, "account_unfrozen");
  assert.deepEqual(state.holds, ["released"]);
  const twice = await applyAccountAction(deps, un);
  assert.ok(twice.ok && twice.effect === "none" && twice.why === "not_frozen");
  assert.equal(state.mails.length, 1);
});

test("a required reason and evidence note: missing ones are 400 and change nothing", async () => {
  const { state, deps } = world();
  for (const bad of [{ reason: "nope" }, { evidenceNote: "" }, { evidenceNote: "abc" }, { action: "delete" as never }, { expectedViolations: undefined }]) {
    const out = await applyAccountAction(deps, { ...base, ...bad });
    assert.ok(!out.ok && out.status === 400, JSON.stringify(bad));
  }
  assert.equal(state.strikes, 0);
});

test("an unknown account is 404", async () => {
  const { deps } = world({ missing: true });
  const out = await applyAccountAction(deps, base);
  assert.ok(!out.ok && out.status === 404);
});

test("emails are calm and plain: never the evidence note, the reason code or an admin", async () => {
  const { state, deps } = world({ history: [{ id: "s0", kind: "warning" }] });
  await applyAccountAction(deps, { ...base, expectedViolations: 1 });
  await applyAccountAction(deps, { ...base, action: "unfreeze", reason: "contacted_admin", expectedViolations: undefined, evidenceNote: "Settled by call, shared a phone number" });
  for (const m of state.mails) {
    const text = JSON.stringify(m.notice).toLowerCase();
    for (const secret of ["phone number", "12:03", "off_platform_contact", "evidence", "score", "a1", "contacted_admin"]) assert.ok(!text.includes(secret), `${m.key} leaks "${secret}"`);
    assert.ok(text.includes("findtern"));
  }
  const frozen = state.mails.find((m) => m.notice.type === "account_frozen")!;
  assert.match(JSON.stringify(frozen.notice.email.lines), /admin@findtern\.in/);
  assert.match(JSON.stringify(frozen.notice.email.lines), /on hold/i);
  assert.match(JSON.stringify(frozen.notice.email.lines), /nothing has been deleted/i);
});

test("a failing mailer never undoes the committed action", async () => {
  const { state, deps } = world();
  deps.notify = async () => { throw new Error("smtp down"); };
  const out = await applyAccountAction(deps, base);
  assert.ok(out.ok && out.effect === "warn");
  assert.equal(state.strikes, 1);
});

test("acknowledge records once; a second click acknowledges nothing and still answers ok", async () => {
  let pending = 1;
  const deps = { now: () => new Date(), async acknowledge() { const n = pending; pending = 0; return n; } };
  assert.deepEqual(await acknowledgeWarning(deps, { type: "employer", id: "e1" }), { ok: true, acknowledged: 1 });
  assert.deepEqual(await acknowledgeWarning(deps, { type: "employer", id: "e1" }), { ok: true, acknowledged: 0 });
});
