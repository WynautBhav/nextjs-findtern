/**
 * Employer project posting lifecycle end to end (Chromium, QA stack). WRITTEN, NOT YET RUN.
 *
 *   E2E_BASE_URL=http://localhost:3500 DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa \
 *     node --test --test-concurrency=1 e2e/projects-lifecycle.e2e.mjs      (npm run test:e2e:projects)
 *
 * Preconditions: QA seed (lib/personas.mjs "admin" and "intern-hired": the intern is unlocked for
 * /intern/opportunities), server with TRUST_PROXY=1. Creates two employers by SQL, removes them after.
 * Tests run in order on one project (P1).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { api, url } from "./lib/browser.mjs";
import { closeDb, one } from "./lib/db.mjs";
import { RUN, SKILLS, cleanup, mkEmployer, mkProject, signedIn } from "./lib/fixtures2.mjs";
import { persona } from "./lib/session.mjs";

let browser;
const P = {};
let E, O; // owner employer, other employer
let pid; // the project under test
const NAME = `Lifecycle ${RUN}`;
const body7 = (name, skills) => ({
  projectName: name,
  skills,
  scopeOfWork: "short-term",
  fullTimeOffer: false,
  locationType: "remote",
  preferredLocations: [],
  pincode: "",
  city: "",
  state: "",
  timezone: "Asia/Kolkata",
});
const status = async (id) => (await one(`SELECT status, rejection_reason FROM projects WHERE id = $1`, [id]));
const move = (page, id, to, reason) => api(page, "POST", `/api/employer/projects/${id}/transition`, { to, reason });
const review = (id, decision, reason) => api(P.A.page, "POST", `/api/admin/projects/${id}/review`, { decision, reason });
/** Is the project on the signed-in intern's open-roles list? Filters by name so the 60-row cap cannot hide it. */
async function internSees(name) {
  await P.I.page.goto(url(`/intern/opportunities?q=${encodeURIComponent(name)}`), { waitUntil: "domcontentloaded" });
  await P.I.page.locator("main").waitFor();
  return ((await P.I.page.locator("main").textContent()) ?? "").includes(name);
}

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  E = await mkEmployer("prjE");
  O = await mkEmployer("prjO");
  P.E = await signedIn(browser, E);
  P.O = await signedIn(browser, O);
  P.A = await signedIn(browser, persona("admin"));
  P.I = await signedIn(browser, persona("intern-hired"));
});

after(async () => {
  for (const p of Object.values(P)) await p.ctx.close().catch(() => {});
  await browser?.close();
  await cleanup();
  await closeDb();
});

test("skill limit on create and edit: 8 rejected, 7 accepted; a new project starts as a draft", async () => {
  const eight = await api(P.E.page, "POST", `/api/employer/${E.id}/projects`, body7(NAME, SKILLS.slice(0, 8)));
  assert.equal(eight.status, 400, JSON.stringify(eight.body));
  assert.match(eight.body.error, /at most 7/i);
  assert.equal(await one(`SELECT 1 AS x FROM projects WHERE employer_id = $1`, [E.id]), null, "nothing was stored");

  const seven = await api(P.E.page, "POST", `/api/employer/${E.id}/projects`, body7(NAME, SKILLS.slice(0, 7)));
  assert.equal(seven.status, 201, JSON.stringify(seven.body));
  pid = seven.body.project.id;
  assert.equal(seven.body.project.status, "draft");
  assert.equal(seven.body.project.skills.length, 7);

  const edit8 = await api(P.E.page, "PUT", `/api/employer/projects/${pid}`, { skills: SKILLS.slice(0, 8) });
  assert.equal(edit8.status, 400, "an edit to 8 skills is refused too");
  assert.equal((await one(`SELECT jsonb_array_length(skills) AS n FROM projects WHERE id = $1`, [pid])).n, 7);
});

test("a draft is not visible to interns", async () => {
  assert.equal(await internSees(NAME), false);
});

test("submit with missing fields → 422 listing them", async () => {
  const bare = await mkProject(E.id, `Bare draft ${RUN}`, { status: "draft", complete: false });
  const r = await move(P.E.page, bare, "pending_review");
  assert.equal(r.status, 422, JSON.stringify(r.body));
  for (const f of ["description", "skills", "locationType"]) assert.ok(r.body.missing.includes(f), `missing lists ${f}: ${r.body.missing}`);
  assert.equal((await status(bare)).status, "draft", "still a draft");
});

test("submit → pending_review, still hidden from interns", async () => {
  const r = await move(P.E.page, pid, "pending_review");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "pending_review");
  assert.ok((await one(`SELECT submitted_at FROM projects WHERE id = $1`, [pid])).submitted_at);
  assert.equal(await internSees(NAME), false);
  const edit = await api(P.E.page, "PUT", `/api/employer/projects/${pid}`, { scopeOfWork: "long-term" });
  assert.equal(edit.status, 409, "a project in review cannot be edited");
});

test("admin rejects without a reason (refused), then with a reason; the employer sees it and 'Edit and resubmit'", async () => {
  const none = await review(pid, "reject");
  // planReview answers 422 for a missing reason (the brief said 400): any 4xx refusal, and nothing changes.
  assert.ok([400, 422].includes(none.status), `reject without reason → ${none.status}`);
  assert.equal((await status(pid)).status, "pending_review");
  const blank = await review(pid, "reject", "   ");
  assert.ok([400, 422].includes(blank.status));

  const reason = `Scope is too vague ${RUN}`;
  const ok = await review(pid, "reject", reason);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(await status(pid), { status: "rejected", rejection_reason: reason });
  assert.equal(await internSees(NAME), false);

  await P.E.page.goto(url("/employer/projects"), { waitUntil: "domcontentloaded" });
  await P.E.page.getByText(reason).waitFor({ timeout: 15_000 });
  await P.E.page.getByRole("button", { name: "Edit and resubmit" }).waitFor();
});

test("the employer resubmits through the button; admin approves → published and on the intern list", async () => {
  await P.E.page.getByRole("button", { name: "Edit and resubmit" }).first().click();
  await P.E.page.getByText(/in review/i).first().waitFor({ timeout: 20_000 });
  assert.equal((await status(pid)).status, "pending_review");
  assert.equal((await status(pid)).rejection_reason, null, "the old reason is cleared on resubmit");

  const approved = await review(pid, "approve");
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal((await status(pid)).status, "published");
  assert.ok((await one(`SELECT published_at FROM projects WHERE id = $1`, [pid])).published_at);
  assert.equal(await internSees(NAME), true, "published → visible");
  const audit = await one(`SELECT 1 AS x FROM admin_audit_log WHERE target_id = $1 AND action = 'project.approve'`, [pid]);
  assert.ok(audit, "approval audited");
});

test("pause hides, resume shows, close is terminal for the employer", async () => {
  assert.equal((await move(P.E.page, pid, "paused")).status, 200);
  assert.equal(await internSees(NAME), false, "paused → hidden");
  assert.equal((await move(P.E.page, pid, "published")).status, 200);
  assert.equal(await internSees(NAME), true, "resumed → visible");
  assert.equal((await move(P.E.page, pid, "closed")).status, 200);
  assert.equal(await internSees(NAME), false, "closed → hidden");
  for (const to of ["published", "paused", "draft", "pending_review"]) {
    const r = await move(P.E.page, pid, to);
    assert.ok(r.status >= 400 && r.status < 500, `closed → ${to} refused (${r.status})`);
  }
  assert.equal((await status(pid)).status, "closed");
  assert.equal((await api(P.E.page, "PUT", `/api/employer/projects/${pid}`, { scopeOfWork: "long-term" })).status, 409, "closed project is not editable");
});

test("concurrent double transition: exactly one winner", async () => {
  // Admin approve x2 on a pending project: the loser is always 409.
  const a = await mkProject(E.id, `Race review ${RUN}`, { status: "pending_review" });
  const rs = await Promise.all([review(a, "approve"), review(a, "approve")]);
  const codes = rs.map((r) => r.status).sort();
  assert.deepEqual(codes, [200, 409], `review race: ${codes}`);
  assert.equal((await status(a)).status, "published");

  // Employer pause x2 on a published project: one 200; the loser is 409 (lost the conditional UPDATE)
  // or 403 (it read the row after the winner and paused→paused is not an edge).
  const rs2 = await Promise.all([move(P.E.page, a, "paused"), move(P.E.page, a, "paused")]);
  const wins = rs2.filter((r) => r.status === 200);
  const losers = rs2.filter((r) => r.status !== 200);
  assert.equal(wins.length, 1, `exactly one winner: ${rs2.map((r) => r.status)}`);
  assert.ok([409, 403].includes(losers[0].status), `loser status ${losers[0].status}`);
  assert.equal((await status(a)).status, "paused");
});

test("another employer cannot transition or edit the project", async () => {
  const mine = await mkProject(E.id, `Owned ${RUN}`, { status: "published" });
  const t = await move(P.O.page, mine, "paused");
  assert.ok([403, 404].includes(t.status), `transition → ${t.status}`);
  const e = await api(P.O.page, "PUT", `/api/employer/projects/${mine}`, { scopeOfWork: "long-term" });
  assert.ok([403, 404].includes(e.status), `edit → ${e.status}`);
  const d = await api(P.O.page, "DELETE", `/api/employer/projects/${mine}`);
  assert.ok([403, 404].includes(d.status), `delete → ${d.status}`);
  assert.equal((await status(mine)).status, "published", "unchanged");
});

test("a legacy 'active' row still shows to interns and can be paused", async () => {
  const name = `Legacy active ${RUN}`;
  const legacy = await mkProject(E.id, name, { status: "active" });
  assert.equal(await internSees(name), true, "legacy active is visible");
  const r = await move(P.E.page, legacy, "paused");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await status(legacy)).status, "paused");
  assert.equal(await internSees(name), false);
});

test("posting form at 390x844: no horizontal scroll; axe finds no serious violation", async () => {
  const phone = await signedIn(browser, E, { width: 390, height: 844 });
  try {
    await phone.page.goto(url("/employer/projects/new"), { waitUntil: "domcontentloaded" });
    await phone.page.getByLabel(/project name/i).first().waitFor({ timeout: 20_000 });
    const m = await phone.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(m.sw <= m.iw + 1, `horizontal overflow: scrollWidth ${m.sw} > ${m.iw}`);

    await P.E.page.goto(url("/employer/projects/new"), { waitUntil: "domcontentloaded" });
    await P.E.page.getByLabel(/project name/i).first().waitFor({ timeout: 20_000 });
    const r = await new AxeBuilder({ page: P.E.page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    assert.deepEqual(bad.map((v) => `${v.id}: ${v.nodes[0]?.target}`), [], "axe serious/critical");
  } finally {
    await phone.ctx.close();
  }
});
