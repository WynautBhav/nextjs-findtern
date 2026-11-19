/**
 * Semester + CGPA verification end to end (server and API, local scratch database only).
 *
 *   E2E_BASE_URL=http://localhost:3235 DATABASE_URL=postgresql://findtern:***@127.0.0.1:54385/findtern_wp5 \
 *     E2E_ADMIN_EMAIL=admin@findtern.dev E2E_ADMIN_PASSWORD='Findtern@2026' \
 *     node --test --test-concurrency=1 e2e/cgpa-verification.e2e.mjs
 *
 * Covers: the onboarding route's semester / proof-slot rules (semesters 1, 2, 5, 6, 10, a missing slot, a wrong file
 * type, another person's file, a legacy intern with no semester, reset on a changed score); the accept stamp and the
 * admin / intern notifications; the admin decision route (verify, mark incorrect, idempotent repeat, conflicting
 * second decision, wrong role, no CSRF, missing fields, unknown candidate); and the admin queue page.
 * Interns, the employer and the project are created by SQL (lib/fixtures2.mjs) and removed after.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { chromium } from "playwright";

import { api, pngBase64, upload, url } from "./lib/browser.mjs";
import { closeDb, one, rows } from "./lib/db.mjs";
import { completeProfile } from "./lib/profile-complete.mjs";
import { cleanup, mkEmployer, mkIntern, mkProject, mkProposal, signedIn } from "./lib/fixtures2.mjs";

const SLOTS = (n) => [...Array.from({ length: n - 1 }, (_, i) => `marksheet-${i + 1}`), "college-id"];
const ADMIN = {
  role: "admin",
  email: process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@findtern.test",
  password: process.env.E2E_ADMIN_PASSWORD ?? "E2e#Admin2026",
};

let browser;
const P = {};
let colour = 10;

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  P.A = await signedIn(browser, ADMIN);
  await P.A.page.goto(url("/"), { waitUntil: "domcontentloaded" });
});

after(async () => {
  for (const p of Object.values(P)) await p.ctx.close().catch(() => {});
  await browser?.close();
  for (const sql of [
    `DELETE FROM admin_audit_log WHERE action IN ('cgpa.verified','cgpa.marked_incorrect') AND target_id = ANY($1)`,
  ]) await rows(sql, [created]).catch(() => {});
  await cleanup();
  await closeDb();
});

const created = [];
async function intern(label) {
  const who = await mkIntern(label);
  created.push(who.id);
  P[label] = await signedIn(browser, who);
  await P[label].page.goto(url("/"), { waitUntil: "domcontentloaded" }); // upload() and api() run fetch in the page
  return who;
}

/** One distinct JPG/PNG-like upload per slot (kind certificate, as the form sends); returns { slotKey: { name, ... } }. */
async function proofs(label, n) {
  const out = {};
  for (const slot of SLOTS(n)) {
    colour = (colour + 7) % 250;
    const r = await upload(P[label].page, { kind: "certificate", base64: pngBase64(48, [colour, 90, 200 - colour]), type: "image/png", name: `${slot}.png` });
    assert.equal(r.status, 201, `upload ${slot}: ${JSON.stringify(r.body)}`);
    out[slot] = { name: r.body.key, originalName: `${slot}.png`, type: r.body.contentType, size: r.body.bytes };
  }
  return out;
}

const academics = (over = {}) => ({
  qualificationLevel: "Bachelor's",
  institution: "JECRC University",
  degree: "B.Tech",
  branch: "",
  startYear: "2023",
  yearOfGraduation: "",
  status: "Pursuing",
  scoreType: "cgpa",
  cgpa: "8.4",
  ...over,
});
const save = (label, a) => api(P[label].page, "POST", "/api/intern/onboarding", { academics: a });
const extra = async (id) => (await one(`SELECT extra_data AS x FROM intern_onboarding WHERE user_id = $1`, [id])).x;

// ── Onboarding route: semester and proof slots ───────────────────────────────────────────────────────────────────
for (const n of [1, 2, 5, 6, 10]) {
  test(`semester ${n}: ${n} proof slot${n === 1 ? "" : "s"} are required, each missing one is named, all present saves and flags the check`, async () => {
    const who = await intern(`s${n}`);
    const missing = await save(`s${n}`, academics({ currentSemester: n }));
    assert.equal(missing.status, 400, JSON.stringify(missing.body));
    assert.deepEqual(Object.keys(missing.body.fields).sort(), SLOTS(n).map((s) => `proof-${s}`).sort());
    assert.equal(missing.body.step, 1);
    assert.equal((await extra(who.id)).cgpaVerification, undefined, "nothing was saved or flagged");

    const files = await proofs(`s${n}`, n);
    const ok = await save(`s${n}`, academics({ currentSemester: n, semesterProofUploads: files }));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const x = await extra(who.id);
    assert.equal(x.academics.currentSemester, n);
    assert.deepEqual(Object.keys(x.academics.semesterProofUploads).sort(), SLOTS(n).sort());
    assert.equal(x.cgpaVerification.status, "pending");
    assert.equal(x.cgpaVerification.semester, n);
    assert.equal(x.cgpaVerification.claimedScore, "8.4");
    assert.equal(x.cgpaVerification.scoreType, "cgpa");
    assert.ok(x.cgpaVerification.requestedAt);
  });
}

test("one missing slot is the only error; a PDF type in a slot and another person's file are refused", async () => {
  const who = await intern("miss");
  const files = await proofs("miss", 3);
  const gap = { ...files };
  delete gap["marksheet-2"];
  const r1 = await save("miss", academics({ currentSemester: 3, semesterProofUploads: gap }));
  assert.equal(r1.status, 400);
  assert.deepEqual(Object.keys(r1.body.fields), ["proof-marksheet-2"]);
  assert.equal(r1.body.fields["proof-marksheet-2"], "Upload your semester 2 marksheet.");

  const pdf = { ...files, "marksheet-1": { ...files["marksheet-1"], type: "application/pdf" } };
  const r2 = await save("miss", academics({ currentSemester: 3, semesterProofUploads: pdf }));
  assert.equal(r2.status, 400);
  assert.match(r2.body.fields["proof-marksheet-1"], /JPG or PNG/);

  await intern("other");
  const theirs = await proofs("other", 1);
  const stolen = { ...files, "college-id": theirs["college-id"] };
  const r3 = await save("miss", academics({ currentSemester: 3, semesterProofUploads: stolen }));
  assert.equal(r3.status, 400, "a file that is not this intern's does not count");
  assert.equal((await extra(who.id)).cgpaVerification, undefined);
});

test("legacy intern: a score with no semester saves and is never flagged", async () => {
  const who = await intern("legacy");
  const r = await save("legacy", academics());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const x = await extra(who.id);
  assert.equal(x.cgpaVerification, undefined);
  assert.equal(x.academics.currentSemester, undefined);
});

test("a changed score or semester resets a decided check to pending; the same claim leaves it alone", async () => {
  const who = await intern("reset");
  const files = await proofs("reset", 2);
  assert.equal((await save("reset", academics({ currentSemester: 2, semesterProofUploads: files }))).status, 200);
  await rows(
    `UPDATE intern_onboarding SET extra_data = jsonb_set(extra_data, '{cgpaVerification}', (extra_data->'cgpaVerification') || '{"status":"verified","decidedAt":"2026-11-01T00:00:00.000Z","decidedBy":"x"}'::jsonb) WHERE user_id = $1`,
    [who.id],
  );
  assert.equal((await save("reset", academics({ currentSemester: 2, semesterProofUploads: files }))).status, 200);
  assert.equal((await extra(who.id)).cgpaVerification.status, "verified", "same claim: still verified");

  assert.equal((await save("reset", academics({ currentSemester: 2, semesterProofUploads: files, cgpa: "9.1" }))).status, 200);
  const x = await extra(who.id);
  assert.equal(x.cgpaVerification.status, "pending");
  assert.equal(x.cgpaVerification.claimedScore, "9.1");
  assert.equal(x.cgpaVerification.decidedAt, undefined);
  assert.equal(x.cgpaVerification.history.length, 2);

  // A semester can be changed but not removed while a check exists.
  const rm = await save("reset", academics({ currentSemester: null }));
  assert.equal(rm.status, 400);
  assert.match(rm.body.error, /can't be removed/);
});

// ── Accepting an offer: the stamp and the notifications ─────────────────────────────────────────────────────────
let E;
test("accepting stamps offerDetails.acceptedAt once, tells the intern, and leaves unflagged interns alone", async () => {
  E = await mkEmployer("cg");
  created.push(E.id);
  P.E = await signedIn(browser, E);
  await P.E.page.goto(url("/"), { waitUntil: "domcontentloaded" });
  const pid = await mkProject(E.id, "CGPA walk project");

  const flagged = await intern("acc");
  const files = await proofs("acc", 2);
  assert.equal((await save("acc", academics({ currentSemester: 2, semesterProofUploads: files }))).status, 200);
  await completeProfile(rows, flagged.id); // the B-62 hire gate: an intern accepts only with a submitted, complete profile
  const offer = await mkProposal(E.id, flagged.id, pid);
  const r = await api(P.acc.page, "PATCH", `/api/proposals/${offer}/status`, { status: "accepted", agreedToTerms: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await one(`SELECT status, offer_details AS d FROM proposals WHERE id = $1`, [offer]);
  assert.equal(row.status, "accepted");
  assert.ok(Date.parse(row.d.acceptedAt) > Date.now() - 60_000, "acceptedAt is now");
  assert.ok(row.d.termsAcceptedAt);
  const note = await rows(`SELECT type, dedupe_key FROM notifications WHERE recipient_id = $1 AND type = 'cgpa_verification_requested'`, [flagged.id]);
  assert.equal(note.length, 1);
  assert.equal(note[0].dedupe_key, `cgpa_requested:${offer}`);

  // Accepted offers cannot be accepted again, so the stamp never moves.
  const again = await api(P.acc.page, "PATCH", `/api/proposals/${offer}/status`, { status: "accepted", agreedToTerms: true });
  assert.ok(again.status >= 400);
  assert.equal((await one(`SELECT offer_details->>'acceptedAt' AS a FROM proposals WHERE id = $1`, [offer])).a, row.d.acceptedAt);

  const plain = await intern("accplain");
  await completeProfile(rows, plain.id);
  const offer2 = await mkProposal(E.id, plain.id, pid);
  const r2 = await api(P.accplain.page, "PATCH", `/api/proposals/${offer2}/status`, { status: "accepted", agreedToTerms: true });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.ok((await one(`SELECT offer_details->>'acceptedAt' AS a FROM proposals WHERE id = $1`, [offer2])).a, "stamped for everyone");
  assert.equal((await rows(`SELECT 1 FROM notifications WHERE recipient_id = $1 AND type = 'cgpa_verification_requested'`, [plain.id])).length, 0, "no CGPA notice for an unflagged intern");
  P.acc.offer = offer;
});

// ── Admin decision route ─────────────────────────────────────────────────────────────────────────────────────────
const decide = (page, internId, body) => api(page, "POST", `/api/admin/cgpa-verifications/${internId}/decision`, body);
const audits = async (internId, action) => (await rows(`SELECT meta FROM admin_audit_log WHERE action = $1 AND target_id = $2`, [action, internId])).length;

test("decision route refuses the wrong role, a missing CSRF token and bad bodies", async () => {
  const who = await intern("guard");
  const files = await proofs("guard", 2);
  assert.equal((await save("guard", academics({ currentSemester: 2, semesterProofUploads: files }))).status, 200);

  assert.ok([401, 403].includes((await decide(P.guard.page, who.id, { decision: "verified" })).status), "an intern is refused");
  assert.ok([401, 403].includes((await decide(P.E.page, who.id, { decision: "verified" })).status), "an employer is refused");
  // No CSRF header: call fetch without it.
  const noCsrf = await P.A.page.evaluate(async (id) => (await fetch(`/api/admin/cgpa-verifications/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "verified" }) })).status, who.id);
  assert.equal(noCsrf, 403);
  assert.equal((await decide(P.A.page, who.id, { decision: "maybe" })).status, 400);
  assert.equal((await decide(P.A.page, "00000000-0000-0000-0000-000000000000", { decision: "verified" })).status, 404);
  assert.equal((await extra(who.id)).cgpaVerification.status, "pending", "nothing changed");

  const noScore = await decide(P.A.page, who.id, { decision: "incorrect", note: "n" });
  assert.equal(noScore.status, 400);
  assert.match(noScore.body.error, /corrected score/i);
  const noNote = await decide(P.A.page, who.id, { decision: "incorrect", correctedScore: "7.9" });
  assert.equal(noNote.status, 400);
  assert.match(noNote.body.error, /note/i);
  const tooHigh = await decide(P.A.page, who.id, { decision: "incorrect", correctedScore: "11", note: "n" });
  assert.equal(tooHigh.status, 400);
  assert.equal((await extra(who.id)).cgpaVerification.status, "pending");
});

test("verify: status, decider and audit are written once; the repeat is a no-op; the opposite decision is refused", async () => {
  const offer = P.acc.offer;
  const who = await one(`SELECT intern_id AS id FROM proposals WHERE id = $1`, [offer]);
  const r = await decide(P.A.page, who.id, { decision: "verified" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "verified");
  const x = await extra(who.id);
  assert.equal(x.cgpaVerification.status, "verified");
  assert.ok(x.cgpaVerification.decidedAt);
  assert.ok(x.cgpaVerification.decidedBy);
  assert.equal(await audits(who.id, "cgpa.verified"), 1);
  const notes = await rows(`SELECT recipient_type FROM notifications WHERE type = 'cgpa_verified' AND (recipient_id = $1 OR recipient_id = $2)`, [who.id, E.id]);
  assert.deepEqual(notes.map((n) => n.recipient_type).sort(), ["employer", "intern"]);

  const again = await decide(P.A.page, who.id, { decision: "verified" });
  assert.equal(again.status, 200);
  assert.equal(again.body.noop, true);
  assert.equal(await audits(who.id, "cgpa.verified"), 1, "no second audit row");
  assert.equal((await rows(`SELECT 1 FROM notifications WHERE type = 'cgpa_verified' AND recipient_id = $1`, [who.id])).length, 1, "no second notice");

  const flip = await decide(P.A.page, who.id, { decision: "incorrect", correctedScore: "7.9", note: "n" });
  assert.equal(flip.status, 409);
  assert.equal((await extra(who.id)).cgpaVerification.status, "verified");
});

test("mark incorrect: the corrected score replaces the profile score, the claim stays in history, accepted offers ask the employer to confirm", async () => {
  const who = await intern("inc");
  const files = await proofs("inc", 2);
  assert.equal((await save("inc", academics({ currentSemester: 2, semesterProofUploads: files }))).status, 200);
  const pid = await mkProject(E.id, "CGPA correction project");
  await completeProfile(rows, who.id);
  const offer = await mkProposal(E.id, who.id, pid);
  assert.equal((await api(P.inc.page, "PATCH", `/api/proposals/${offer}/status`, { status: "accepted", agreedToTerms: true })).status, 200);
  // The employer had already confirmed something earlier: the correction must clear that.
  await rows(`UPDATE proposals SET offer_details = offer_details || '{"cgpaAckAt":"2026-01-01T00:00:00.000Z"}'::jsonb WHERE id = $1`, [offer]);

  const r = await decide(P.A.page, who.id, { decision: "incorrect", correctedScore: "7.9", note: "Semester 1 marksheet shows 7.9" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const x = await extra(who.id);
  assert.equal(x.cgpaVerification.status, "incorrect");
  assert.equal(x.cgpaVerification.correctedScore, "7.9");
  assert.equal(x.cgpaVerification.claimedScore, "8.4");
  assert.equal(x.academics.score, "7.9", "the profile carries the corrected score");
  const last = x.cgpaVerification.history.at(-1);
  assert.equal(last.event, "incorrect");
  assert.equal(last.claimedScore, "8.4");
  assert.equal(last.correctedScore, "7.9");

  const d = (await one(`SELECT offer_details AS d FROM proposals WHERE id = $1`, [offer])).d;
  assert.equal(d.cgpaAckAt, undefined, "the employer must confirm again");
  assert.deepEqual({ from: d.cgpaCorrection.from, to: d.cgpaCorrection.to }, { from: "8.4", to: "7.9" });
  assert.equal(await audits(who.id, "cgpa.marked_incorrect"), 1);
  const audit = (await rows(`SELECT meta FROM admin_audit_log WHERE action = 'cgpa.marked_incorrect' AND target_id = $1`, [who.id]))[0].meta;
  assert.deepEqual(audit.before, { status: "pending", score: "8.4" });
  assert.deepEqual(audit.after, { status: "incorrect", score: "7.9" });
  const notes = await rows(`SELECT recipient_type, message FROM notifications WHERE type = 'cgpa_incorrect' AND (recipient_id = $1 OR recipient_id = $2)`, [who.id, E.id]);
  assert.deepEqual(notes.map((n) => n.recipient_type).sort(), ["employer", "intern"]);
  assert.match(notes.find((n) => n.recipient_type === "employer").message, /8\.4.*7\.9/);

  // Saving the corrected score again is not a new claim.
  assert.equal((await save("inc", academics({ currentSemester: 2, semesterProofUploads: files, cgpa: "7.9" }))).status, 200);
  assert.equal((await extra(who.id)).cgpaVerification.status, "incorrect");
});

// ── Admin queue page ─────────────────────────────────────────────────────────────────────────────────────────────
test("the queue page lists pending checks with proofs and the decision buttons; employers cannot open it", async () => {
  const who = await intern("queue");
  const files = await proofs("queue", 5);
  assert.equal((await save("queue", academics({ currentSemester: 5, semesterProofUploads: files }))).status, 200);
  const page = P.A.page;
  await page.goto(url("/admin/cgpa-verifications"), { waitUntil: "domcontentloaded" });
  await page.getByText(who.name).first().waitFor({ timeout: 30_000 });
  assert.equal(await page.getByRole("button", { name: "Verify CGPA correct" }).count() > 0, true);
  const card = page.locator("li", { hasText: who.name }).first();
  assert.equal(await card.getByRole("img").count(), 5, "five proof thumbnails");
  assert.match((await card.textContent()) ?? "", /Semester 5/);

  const res = await P.E.page.goto(url("/admin/cgpa-verifications"), { waitUntil: "domcontentloaded" });
  assert.ok(res && (res.status() >= 400 || !/CGPA checks/.test((await P.E.page.textContent("body")) ?? "")), "an employer does not get the queue");
});
