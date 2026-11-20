import { test } from "node:test";
import assert from "node:assert/strict";

import { decideWork, flagRunningHire, workPanelState, type RunningHire, type WorkDeps, type WorkTxState } from "./work-exempt.ts";
import { applyAccountAction, type StandingDeps, type StandingInput } from "./standing-service.ts";

const HIRE: RunningHire = { proposalId: "p1", company: "Brightwell" };
const NOW = new Date("2026-11-20T10:00:00Z");

/** An in-memory intern row and its audit log: the same service the route calls, no database. */
function world(init: Partial<WorkTxState> = {}, hire: RunningHire | null = HIRE) {
  const row: WorkTxState = { name: "Asha", frozen: true, workExemptAt: null, workDecisionAt: null, reviewNotifiedAt: null, ...init };
  const w = { row, audits: [] as { action: string; meta: Record<string, unknown>; adminId: string }[], closed: 0, hire };
  const deps: WorkDeps = {
    now: () => NOW,
    runningHire: async () => w.hire,
    closeAlert: async () => { w.closed++; },
    async transaction(_id, fn) {
      return fn({
        state: { ...w.row },
        async set(p) { if ("workExemptAt" in p) w.row.workExemptAt = p.workExemptAt ?? null; if ("workDecisionAt" in p) w.row.workDecisionAt = p.workDecisionAt ?? null; },
        async audit(e) { w.audits.push(e); },
      });
    },
  };
  return { w, deps };
}
const base = { internId: "u1", adminId: "a1", note: "Payments are due this week" };

test("grant: needs a note, a frozen account and a running hire; sets the exemption, audits it, closes the alert", async () => {
  const { w, deps } = world();
  assert.deepEqual(await decideWork(deps, { ...base, decision: "grant", note: " " }), { ok: false, status: 400, error: "Add a short note about why." });
  assert.equal((await decideWork(deps, { ...base, decision: "nope" })).ok, false);
  assert.equal(w.audits.length, 0);
  const out = await decideWork(deps, { ...base, decision: "grant" });
  assert.deepEqual(out, { ok: true, effect: "granted" });
  assert.equal(w.row.workExemptAt, NOW);
  assert.equal(w.row.workDecisionAt, NOW);
  assert.deepEqual(w.audits.map((a) => a.action), ["account.work_exempt_grant"]);
  assert.equal(w.audits[0].meta.note, base.note);
  assert.equal(w.audits[0].adminId, "a1");
  assert.equal(w.closed, 1);
});

test("grant refuses when there is no running hire or the account is not frozen", async () => {
  const noHire = world({}, null);
  const r = await decideWork(noHire.deps, { ...base, decision: "grant" });
  assert.ok(!r.ok && r.status === 409);
  assert.equal(noHire.w.row.workExemptAt, null);
  const clean = world({ frozen: false });
  const r2 = await decideWork(clean.deps, { ...base, decision: "grant" });
  assert.ok(!r2.ok && r2.status === 409);
});

test("grant twice is a no-op (one audit row); revoke takes it back and audits; revoke when not exempt is a no-op", async () => {
  const { w, deps } = world();
  await decideWork(deps, { ...base, decision: "grant" });
  assert.deepEqual(await decideWork(deps, { ...base, decision: "grant" }), { ok: true, effect: "none", why: "already_exempt" });
  assert.equal(w.audits.length, 1);
  assert.deepEqual(await decideWork(deps, { ...base, decision: "revoke" }), { ok: true, effect: "revoked" });
  assert.equal(w.row.workExemptAt, null);
  assert.deepEqual(w.audits.map((a) => a.action), ["account.work_exempt_grant", "account.work_exempt_revoke"]);
  assert.deepEqual(await decideWork(deps, { ...base, decision: "revoke" }), { ok: true, effect: "none", why: "not_exempt" });
  assert.equal(w.audits.length, 2);
});

test("keep fully frozen: records the choice once, audits it, never cancels anything", async () => {
  const { w, deps } = world();
  assert.deepEqual(await decideWork(deps, { ...base, decision: "keep_frozen" }), { ok: true, effect: "kept_frozen" });
  assert.equal(w.row.workDecisionAt, NOW);
  assert.equal(w.row.workExemptAt, null);
  assert.deepEqual(await decideWork(deps, { ...base, decision: "keep_frozen" }), { ok: true, effect: "none", why: "already_decided" });
  assert.deepEqual(w.audits.map((a) => a.action), ["account.work_exempt_keep_frozen"]);
});

test("the alert on freeze goes out once, only with a running hire, only to admins' channel", async () => {
  const sent: unknown[] = [];
  let claimed = false;
  const deps = { runningHire: async () => HIRE, claim: async () => (claimed ? false : (claimed = true)), alertAdmins: async (a: unknown) => { sent.push(a); } };
  assert.deepEqual(await flagRunningHire(deps, { id: "u1", name: "Asha" }), { flagged: true, company: "Brightwell" });
  assert.deepEqual(await flagRunningHire(deps, { id: "u1", name: "Asha" }), { flagged: false });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { internId: "u1", internName: "Asha", company: "Brightwell" });
  const none = { ...deps, runningHire: async () => null, claim: async () => { throw new Error("must not claim"); } };
  assert.deepEqual(await flagRunningHire(none, { id: "u2", name: "B" }), { flagged: false });
});

test("panel state: pending, exempt, kept frozen, lapsed (hire ended), none (unfrozen or no hire)", () => {
  const t = new Date();
  assert.deepEqual(workPanelState({ frozen: false, workExemptAt: t, workDecisionAt: t, hire: HIRE }), { kind: "none" });
  assert.deepEqual(workPanelState({ frozen: true, workExemptAt: null, workDecisionAt: null, hire: null }), { kind: "none" });
  assert.deepEqual(workPanelState({ frozen: true, workExemptAt: null, workDecisionAt: null, hire: HIRE }), { kind: "pending", company: "Brightwell" });
  assert.deepEqual(workPanelState({ frozen: true, workExemptAt: t, workDecisionAt: t, hire: HIRE }), { kind: "exempt", company: "Brightwell", since: t });
  assert.deepEqual(workPanelState({ frozen: true, workExemptAt: null, workDecisionAt: t, hire: HIRE }), { kind: "kept_frozen", company: "Brightwell" });
  assert.deepEqual(workPanelState({ frozen: true, workExemptAt: t, workDecisionAt: t, hire: null }), { kind: "lapsed" });
});

/* ---- wired into the standing service: freeze (direct or second strike) -> one alert; warn and unfreeze -> none */
function standing(opts: { hire: RunningHire | null; type?: "intern" | "employer"; workExempt?: boolean }) {
  const s = { frozen: false, calls: [] as string[], afterFreeze: 0, audits: [] as { action: string; meta: Record<string, unknown> }[], n: 0 };
  const deps: StandingDeps = {
    now: () => NOW,
    async transaction(_subject, fn) {
      return fn({
        state: { name: "Asha", frozen: s.frozen, history: [], workExempt: opts.workExempt },
        async insertStrike() { return `s${++s.n}`; },
        async setFrozen(at) { s.frozen = at !== null; },
        async audit(e) { s.audits.push(e); },
      });
    },
    async notify() {},
    async afterHoldChange() {},
    async afterFreeze(i) { s.calls.push(i.id); await flagRunningHire({ runningHire: async () => opts.hire, claim: async () => true, alertAdmins: async () => { s.afterFreeze++; } }, i); },
  };
  return { s, deps };
}
const freeze = (type: "intern" | "employer"): StandingInput => ({ subject: { type, id: "u1" }, adminId: "a1", action: "freeze", reason: "off_platform_contact", evidenceNote: "Shared a phone number at 12:03", expectedViolations: 0 });

test("freezing an intern with a running hire alerts the admins once; without a hire, or for a warning, nothing", async () => {
  const withHire = standing({ hire: HIRE });
  assert.ok((await applyAccountAction(withHire.deps, freeze("intern"))).ok);
  assert.equal(withHire.s.afterFreeze, 1);
  const again = await applyAccountAction(withHire.deps, freeze("intern"));
  assert.ok(again.ok && again.effect === "none", "already frozen: no-op, no second alert");
  assert.equal(withHire.s.afterFreeze, 1);

  const noHire = standing({ hire: null });
  await applyAccountAction(noHire.deps, freeze("intern"));
  assert.equal(noHire.s.afterFreeze, 0);

  const warn = standing({ hire: HIRE });
  await applyAccountAction(warn.deps, { ...freeze("intern"), action: "violation", expectedViolations: 0 });
  assert.equal(warn.s.calls.length, 0, "a warning never asks");

  const employer = standing({ hire: HIRE });
  await applyAccountAction(employer.deps, freeze("employer"));
  assert.equal(employer.s.calls.length, 0, "employers are not part of the running-hire alert");
});

test("a second confirmed strike (auto freeze) alerts too, and an unfreeze records that the exemption was cleared", async () => {
  const w = standing({ hire: HIRE });
  const v = (n: number): StandingInput => ({ ...freeze("intern"), action: "violation", expectedViolations: n });
  await applyAccountAction(w.deps, v(0));
  assert.equal(w.s.afterFreeze, 0);
  w.deps.transaction = ((orig) => async (subject, fn) => orig(subject, async (tx) => fn({ ...tx, state: { ...tx.state, history: [{ id: "x", kind: "warning", acknowledgedAt: null }] } })))(w.deps.transaction);
  await applyAccountAction(w.deps, v(1));
  assert.equal(w.s.frozen, true);
  assert.equal(w.s.afterFreeze, 1);

  const ex = standing({ hire: HIRE, workExempt: true });
  ex.s.frozen = true;
  await applyAccountAction(ex.deps, { ...freeze("intern"), action: "unfreeze", reason: "contacted_admin" });
  assert.equal(ex.s.frozen, false);
  assert.equal(ex.s.audits.at(-1)?.meta.clearedWorkExempt, true);
});
