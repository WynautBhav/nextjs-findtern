/**
 * College roster, matching and the shared student code (PLAN §2, WP-B; owner
 * answers OA4, OA5).
 *
 *   300-seat batch = ₹2,40,000; no officer login before it is paid → import a
 *   file with "Student Name / Email ID / Mobile" headers (classified preview,
 *   mapping override, duplicates, invalid rows, the same file again returns the
 *   same import) → email + verified auto-links, same email unverified and
 *   phone-only never do (review queue → link / reject) → over-allocation needs
 *   a flag → the shared code waives the fee once per student → the officer
 *   dashboard numbers → nothing crosses to another college (404).
 *
 * Specs for contracts that are not merged yet fail here until they are (the
 * report names which); assertions are not weakened to pass.
 *
 * Run through e2e/run.mjs (`npm run e2e`, E2E_SPECS=college-roster).
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { baseUrl, ROOT, testDatabaseUrl } from "./lib/env.mjs";
import { visit } from "./lib/browser.mjs";
import {
  closeDb, db, expectNoText, expectText, nextPhone, one, rows, seedAdmin, seedCollege, seedIntern, send, sendOk, signedInContext, uniq,
} from "./lib/fixtures.mjs";

testDatabaseUrl();

const state = {};
let browser;

const shot = async (page, name) => page.screenshot({ path: join(ROOT, "e2e", ".artifacts", `fail-college-roster-${name}.png`), fullPage: true }).catch(() => {});
const b64 = (text) => Buffer.from(text, "utf8").toString("base64");
const csv = (lines) => lines.join("\n") + "\n";
const importUrl = (collegeId, importId = "") => `/api/admin/colleges/${collegeId}/roster-imports${importId ? `/${importId}` : ""}`;
const upload = (collegeId, fileName, text) => send(state.adminCtx, "POST", importUrl(collegeId), { fileName, fileBase64: b64(text) });
const dbRoster = (collegeId) => rows(`SELECT * FROM college_roster WHERE college_id = $1 ORDER BY email`, [collegeId]);
const byEmail = (list, email) => list.find((r) => r.email === email.toLowerCase());

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  state.admin = await seedAdmin();
  state.adminCtx = await signedInContext(browser, state.admin);
  const tag = uniq("rs").replace(/-/g, "");

  // Interns the file will refer to. Names are unique so nothing matches by name by accident.
  state.redeemer = await seedIntern({ label: "ros-redeemer", firstName: "Priya", lastName: `Nair${tag}`, score: 8, emailVerified: true, skills: ["React", "SQL", "Python", "Excel"] });
  state.unverified = await seedIntern({ label: "ros-unverified", firstName: "Una", lastName: `Verify${tag}`, emailVerified: false });
  state.phoneOnly = await seedIntern({ label: "ros-phone", firstName: "Pooja", lastName: `Phone${tag}` });
  state.phoneOnly2 = await seedIntern({ label: "ros-phone2", firstName: "Prem", lastName: `Phonetwo${tag}` });
  state.otherCollegeStudent = await seedIntern({ label: "ros-other", firstName: "Omar", lastName: `Other${tag}`, score: 8 });
  state.tag = tag;
});

after(async () => {
  await browser?.close();
  await closeDb();
});

/* ── Money and the first-payment rule ───────────────────────────────────── */

test("a 300-seat batch costs ₹2,40,000; the officer login does not exist until it is paid", async () => {
  const college = await sendOk(state.adminCtx, "POST", "/api/admin/colleges", { name: `Roster Institute ${state.tag}`, city: "Pune", state: "Maharashtra", isPartner: true }, [201]);
  state.collegeId = college.id;
  await sendOk(state.adminCtx, "POST", `/api/admin/colleges/${state.collegeId}/seat-batches`, { seats: 300 }, [200]);
  const batch = await one(`SELECT id, seats, amount_minor, status FROM college_seat_batches WHERE college_id = $1`, [state.collegeId]);
  assert.equal(batch.seats, 300);
  assert.equal(Number(batch.amount_minor), 24_000_000, "₹800 a seat × 300 = ₹2,40,000 (in paise)");
  assert.equal(batch.status, "pending");

  const email = `${uniq("tpo")}@e2e-college.test`;
  const early = await send(state.adminCtx, "POST", `/api/admin/colleges/${state.collegeId}/admins`, { name: "E2E Officer", email });
  assert.equal(early.status, 409, JSON.stringify(early.body));
  assert.match(String(early.body.error), /awaiting first payment/i);
  const none = await rows(`SELECT id FROM college_admins WHERE college_id = $1`, [state.collegeId]);
  assert.equal(none.length, 0, "no officer row exists before the first paid batch");

  await sendOk(state.adminCtx, "PATCH", `/api/admin/colleges/${state.collegeId}/seat-batches/${batch.id}`, { action: "paid", method: "bank", referenceId: uniq("UTR") }, [200]);
  const made = await sendOk(state.adminCtx, "POST", `/api/admin/colleges/${state.collegeId}/admins`, { name: "E2E Officer", email }, [201]);
  state.tpo = { email, password: made.password, role: "college" };
  state.tpoCtx = await signedInContext(browser, state.tpo);
  const promo = await one(`SELECT id, code, max_usages, used_count FROM promo_codes WHERE college_id = $1`, [state.collegeId]);
  state.code = promo.code;
  assert.equal(promo.max_usages, 300, "the shared code's cap is the paid seats");

  // A second, tiny college for the over-allocation and cross-college checks.
  state.b = await seedCollege(state.adminCtx, { name: `Roster Annex ${state.tag}`, seats: 2 });
});

/* ── Import: preview ────────────────────────────────────────────────────── */

const rosterFile = () =>
  csv([
    "Student Name,Email ID,Mobile", // line 1 (header)
    `Priya Nair,${state.redeemer.email},${state.redeemer.phone}`, // 2: verified email → auto-link
    `Una Unverified,${state.unverified.email},${nextPhone()}`, // 3: same email, not verified → never auto-linked
    `Pooja Phonebook,poojas.college.${state.tag}@gmail.com,${state.phoneOnly.phone}`, // 4: phone-only match → review
    `Rahul Rosterman,rahul.${state.tag}@gmail.com,${nextPhone()}`, // 5
    `Sana Sheetly,sana.${state.tag}@gmail.com,${nextPhone()}`, // 6
    `Rahul Again,RAHUL.${state.tag}@gmail.com,${nextPhone()}`, // 7: duplicate of line 5
    `Broken Email,not-an-email,${nextPhone()}`, // 8
    `No Email,,${nextPhone()}`, // 9
    `Bad Phone,badphone.${state.tag}@gmail.com,12345`, // 10
    `Plus Ninety,plus90.${state.tag}@gmail.com,+91 98765 43210`, // 11
  ]);

test("the preview classifies every row with a sentence and writes nothing to the roster", async () => {
  state.file1 = rosterFile();
  const res = await upload(state.collegeId, `students-${state.tag}.csv`, state.file1);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 400));
  const p = res.body;
  state.import1 = p.importId;
  assert.ok(p.importId);
  assert.equal(p.status, "previewed");
  assert.deepEqual({ name: p.mapping.name, email: p.mapping.email, phone: p.mapping.phone }, { name: 0, email: 1, phone: 2 }, "headers Student Name / Email ID / Mobile are recognised");
  assert.equal(p.counts.total, 10);
  assert.equal(p.counts.valid, 6);
  assert.equal(p.counts.invalid, 3);
  assert.equal(p.counts.duplicate, 1);
  assert.equal(p.counts.update, 0);
  assert.equal(p.counts.matchedEmail, 1, "only the verified-email intern matches by email");
  assert.equal(p.counts.review, 1, "the phone-only match waits for an admin");
  assert.equal(p.counts.unmatched, 4);
  const line = (n) => p.rows.find((r) => r.line === n);
  assert.equal(line(7).status, "duplicate");
  assert.match(line(7).reason, /Duplicate of line 5/);
  assert.equal(line(8).status, "invalid");
  assert.match(line(8).reason, /Email is not valid/);
  assert.equal(line(9).status, "invalid");
  assert.match(line(9).reason, /Missing email/);
  assert.equal(line(10).status, "invalid");
  assert.match(line(10).reason, /Phone is not a 10-digit mobile number/);
  assert.equal(line(11).status, "valid");
  assert.equal(line(11).phone, "9876543210", "+91 and spaces are stripped");
  assert.equal(line(4).status, "valid");
  assert.match(String(line(4).reason ?? ""), /Possible match: same phone/);
  assert.deepEqual(p.overAllocation, { rosterAfter: 6, paidSeats: 300 });
  assert.equal((await dbRoster(state.collegeId)).length, 0, "a preview writes no roster rows");
});

test("the same file again returns the same import, not a second one", async () => {
  const again = await upload(state.collegeId, `students-${state.tag}-copy.csv`, state.file1);
  assert.equal(again.status, 200, JSON.stringify(again.body).slice(0, 300));
  assert.equal(again.body.importId, state.import1);
  const n = await one(`SELECT count(*)::int AS n FROM college_roster_imports WHERE college_id = $1`, [state.collegeId]);
  assert.equal(n.n, 1);
});

test("unreadable files and files without an email column are refused with a sentence", async () => {
  const empty = await upload(state.collegeId, "empty.csv", "");
  assert.equal(empty.status, 400, JSON.stringify(empty.body));
  assert.ok(typeof empty.body.error === "string" && empty.body.error.length > 5);
  const noEmail = await upload(state.collegeId, `no-email-${state.tag}.csv`, csv(["Learner,Contact", "A Learner,9876501234"]));
  assert.equal(noEmail.status, 400, JSON.stringify(noEmail.body));
  assert.match(String(noEmail.body.error), /email/i);
  const wrongType = await send(state.adminCtx, "POST", importUrl(state.collegeId), { fileName: "photo.png", fileBase64: b64("not a sheet") });
  assert.equal(wrongType.status, 400, "only .csv/.tsv/.xlsx");
});

test("a mapping override re-classifies the same import (drop the phone column → the bad-phone row becomes valid)", async () => {
  const r = await send(state.adminCtx, "PATCH", importUrl(state.collegeId, state.import1), { action: "remap", mapping: { name: 0, email: 1, phone: null } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.counts.invalid, 2, "line 10 is no longer invalid without the phone column");
  assert.equal(r.body.rows.find((x) => x.line === 10).status, "valid");
  assert.equal(r.body.counts.review, 0, "no phone, no phone match");
  const back = await send(state.adminCtx, "PATCH", importUrl(state.collegeId, state.import1), { action: "remap", mapping: { name: 0, email: 1, phone: 2 } });
  assert.equal(back.status, 200);
  assert.equal(back.body.counts.invalid, 3);
  assert.equal(back.body.counts.review, 1);
});

/* ── Import: commit and matching ────────────────────────────────────────── */

test("commit: valid rows land once, the verified email auto-links, nothing links on phone or an unverified email", async () => {
  const r = await send(state.adminCtx, "PATCH", importUrl(state.collegeId, state.import1), { action: "commit" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { created: 6, updated: 0, autoLinked: 1, review: 1, skippedInvalid: 4 }); // skipped = 3 invalid + 1 duplicate
  const list = await dbRoster(state.collegeId);
  assert.equal(list.length, 6);
  const priya = byEmail(list, state.redeemer.email);
  assert.equal(priya.match_status, "email");
  assert.equal(priya.matched_user_id, state.redeemer.id);
  const una = byEmail(list, state.unverified.email);
  assert.equal(una.matched_user_id, null, "an unverified email is not proof");
  assert.notEqual(una.match_status, "email");
  const pooja = byEmail(list, `poojas.college.${state.tag}@gmail.com`);
  assert.equal(pooja.match_status, "review");
  assert.equal(pooja.matched_user_id, null, "a phone match never links by itself");
  assert.deepEqual(pooja.match_candidates.map((c) => [c.userId, c.reason]), [[state.phoneOnly.id, "phone"]]);
  assert.equal(byEmail(list, `plus90.${state.tag}@gmail.com`).phone, "9876543210");
  const audited = await rows(`SELECT action FROM admin_audit_log WHERE target_id = $1 AND action IN ('roster.import_commit','roster.match_auto')`, [state.collegeId]).catch(() => []);
  if (audited.length) assert.ok(audited.some((a) => a.action === "roster.import_commit"));
});

test("a committed import cannot be committed or discarded again (409); the same file still resolves to it", async () => {
  const twice = await send(state.adminCtx, "PATCH", importUrl(state.collegeId, state.import1), { action: "commit" });
  assert.equal(twice.status, 409, JSON.stringify(twice.body));
  const discard = await send(state.adminCtx, "PATCH", importUrl(state.collegeId, state.import1), { action: "discard" });
  assert.equal(discard.status, 409);
  const retry = await upload(state.collegeId, "students-retry.csv", state.file1);
  assert.equal(retry.body.importId, state.import1);
  assert.equal(retry.body.status, "committed");
  assert.equal((await dbRoster(state.collegeId)).length, 6, "retrying the file duplicated nothing");
});

test("a second file updates a known student and queues another phone-only match", async () => {
  const file2 = csv([
    "Student Name,Email ID,Mobile",
    `Rahul Rosterman Jr,rahul.${state.tag}@gmail.com,${nextPhone()}`, // update of line 5
    `Prem Phonebook,prems.college.${state.tag}@gmail.com,${state.phoneOnly2.phone}`, // new, phone-only match
  ]);
  const res = await upload(state.collegeId, `students-${state.tag}-b.csv`, file2);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.counts.update, 1);
  assert.match(res.body.rows[0].reason, /Already on the roster \(will update name\/phone\)/);
  assert.equal(res.body.counts.review, 1);
  const commit = await send(state.adminCtx, "PATCH", importUrl(state.collegeId, res.body.importId), { action: "commit" });
  assert.equal(commit.status, 200, JSON.stringify(commit.body));
  assert.equal(commit.body.updated, 1);
  assert.equal(commit.body.created, 1);
  const list = await dbRoster(state.collegeId);
  assert.equal(list.length, 7);
  assert.equal(byEmail(list, `rahul.${state.tag}@gmail.com`).name, "Rahul Rosterman Jr");
});

test("review queue: the admin sees the two phone matches, links one, refuses a student already linked, rejects the other [UI]", async () => {
  const list = await dbRoster(state.collegeId);
  const pooja = byEmail(list, `poojas.college.${state.tag}@gmail.com`);
  const prem = byEmail(list, `prems.college.${state.tag}@gmail.com`);

  const page = await state.adminCtx.newPage();
  try {
    await visit(page, "/admin/colleges/review");
    const text = await page.locator("main").innerText();
    expectText(text, /Pooja Phonebook/, "the review queue lists the phone-only row");
    expectText(text, /Prem Phonebook/, "…and the second one");
  } catch (err) {
    await shot(page, "review-queue");
    throw err;
  } finally {
    await page.close();
  }

  const link = await send(state.adminCtx, "PATCH", `/api/admin/colleges/${state.collegeId}/roster/${pooja.id}/match`, { action: "link", userId: state.phoneOnly.id });
  assert.equal(link.status, 200, JSON.stringify(link.body));
  assert.equal(link.body.matchStatus, "linked");
  const dupe = await send(state.adminCtx, "PATCH", `/api/admin/colleges/${state.collegeId}/roster/${prem.id}/match`, { action: "link", userId: state.phoneOnly.id });
  // Prem's row never showed this student as a candidate, so the link is refused before the one-row-per-college rule is reached.
  assert.equal(dupe.status, 400, "a student who is not a candidate for the row cannot be linked to it");
  const stranger = await send(state.adminCtx, "PATCH", `/api/admin/colleges/${state.collegeId}/roster/${prem.id}/match`, { action: "link", userId: state.otherCollegeStudent.id });
  assert.ok([400, 404].includes(stranger.status), `an intern who is not a candidate cannot be linked (got ${stranger.status})`);
  const reject = await send(state.adminCtx, "PATCH", `/api/admin/colleges/${state.collegeId}/roster/${prem.id}/match`, { action: "reject" });
  assert.equal(reject.status, 200, JSON.stringify(reject.body));
  assert.equal(reject.body.matchStatus, "rejected");
  const after = await dbRoster(state.collegeId);
  assert.equal(byEmail(after, `poojas.college.${state.tag}@gmail.com`).matched_user_id, state.phoneOnly.id);
  assert.equal(byEmail(after, `prems.college.${state.tag}@gmail.com`).matched_user_id, null);
  const membership = await rows(`SELECT 1 FROM college_memberships WHERE user_id = $1`, [state.phoneOnly.id]);
  assert.equal(membership.length, 0, "linking does not verify the student or grant the fee waiver");
});

test("over-allocation: more roster rows than paid seats needs an explicit flag", async () => {
  const file = csv([
    "Student Name,Email ID,Mobile",
    `Ann Annex,ann.${state.tag}@gmail.com,${nextPhone()}`,
    `Ben Annex,ben.${state.tag}@gmail.com,${nextPhone()}`,
    `Cy Annex,cy.${state.tag}@gmail.com,${nextPhone()}`,
  ]);
  const res = await upload(state.b.collegeId, `annex-${state.tag}.csv`, file);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.deepEqual(res.body.overAllocation, { rosterAfter: 3, paidSeats: 2 });
  const refused = await send(state.adminCtx, "PATCH", importUrl(state.b.collegeId, res.body.importId), { action: "commit" });
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.equal((await dbRoster(state.b.collegeId)).length, 0, "nothing written when refused");
  const allowed = await send(state.adminCtx, "PATCH", importUrl(state.b.collegeId, res.body.importId), { action: "commit", allowOverAllocation: true });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  assert.equal(allowed.body.created, 3);
  const flag = await one(`SELECT over_allocation FROM college_roster_imports WHERE id = $1`, [res.body.importId]);
  assert.equal(flag.over_allocation, true, "the import is flagged");
});

/* ── The shared code ────────────────────────────────────────────────────── */

test("the shared student code waives the activation fee once; a second redemption is refused", async () => {
  const ctx = await signedInContext(browser, state.redeemer);
  try {
    const before = await one(`SELECT used_count FROM promo_codes WHERE college_id = $1`, [state.collegeId]);
    const noTick = await send(ctx, "POST", `/api/intern/${state.redeemer.id}/payment/razorpay/order`, { promoCode: state.code });
    assert.equal(noTick.status, 400, "the 18+ tick is required with a college code");
    const res = await send(ctx, "POST", `/api/intern/${state.redeemer.id}/payment/razorpay/order`, { promoCode: state.code, declaredAdult: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.free, true, "the fee is waived, no gateway order");
    const pay = await one(`SELECT gateway, status, amount_minor FROM intern_payments WHERE intern_id = $1 AND status = 'paid'`, [state.redeemer.id]);
    assert.equal(pay.gateway, "free");
    assert.equal(Number(pay.amount_minor), 0);
    const after = await one(`SELECT used_count FROM promo_codes WHERE college_id = $1`, [state.collegeId]);
    assert.equal(after.used_count, before.used_count + 1);
    const m = await one(`SELECT college_id, status FROM college_memberships WHERE user_id = $1 AND left_at IS NULL`, [state.redeemer.id]);
    assert.equal(m.college_id, state.collegeId);
    assert.equal(m.status, "verified");

    const again = await send(ctx, "POST", `/api/intern/${state.redeemer.id}/payment/razorpay/order`, { promoCode: state.code, declaredAdult: true });
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.alreadyPaid, true);
    const quote = await send(ctx, "POST", `/api/intern/${state.redeemer.id}/payment/validate-promo`, { code: state.code });
    assert.equal(quote.status, 409, "a paid profile has nothing left to discount");
    const final = await one(`SELECT used_count FROM promo_codes WHERE college_id = $1`, [state.collegeId]);
    assert.equal(final.used_count, before.used_count + 1, "one student, one seat");
    const payments = await rows(`SELECT id FROM intern_payments WHERE intern_id = $1 AND status = 'paid'`, [state.redeemer.id]);
    assert.equal(payments.length, 1, "no second payment row");
  } finally {
    await ctx.close();
  }
});

/* ── The officer's view ─────────────────────────────────────────────────── */

test("the officer dashboard shows the roster, joined and seat numbers [UI]", async () => {
  const page = await state.tpoCtx.newPage();
  try {
    await visit(page, "/college");
    const main = await page.locator("main").innerText();
    expectText(main, /Registered\s*1\s*of 7 on your roster/, "1 of the 7 roster students has registered (the redeemer)");
    expectText(main, /1 of 300 used\s*·\s*299 left/, "seats used and left");
    expectText(main, new RegExp(state.code), "the shared code is shown");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, "no sideways scroll at 1280");
  } catch (err) {
    await shot(page, "dashboard");
    throw err;
  } finally {
    await page.close();
  }
  const phone = await signedInContext(browser, state.tpo, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const small = await phone.newPage();
  try {
    await visit(small, "/college");
    assert.equal(await small.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "no horizontal scroll at 390");
  } catch (err) {
    await shot(small, "dashboard-390");
    throw err;
  } finally {
    await phone.close();
  }
});

test("the officer's roster page lists the rows with their match status, without other colleges' students", async () => {
  const page = await state.tpoCtx.newPage();
  try {
    await visit(page, "/college/roster");
    const main = await page.locator("main").innerText();
    expectText(main, /Rahul Rosterman Jr/);
    expectNoText(main, /Ann Annex|Ben Annex/, "another college's roster never shows here");
  } catch (err) {
    await shot(page, "roster-page");
    throw err;
  } finally {
    await page.close();
  }
});

/* ── Isolation ──────────────────────────────────────────────────────────── */

test("nothing crosses colleges: another college's student, roster row and import are 404 to this officer and this admin route", async () => {
  // Make Omar a verified member of the annex only.
  await db().query(
    `INSERT INTO college_memberships (user_id, college_id, status, verified_by) VALUES ($1, $2, 'verified', 'roster') ON CONFLICT (user_id) DO NOTHING`,
    [state.otherCollegeStudent.id, state.b.collegeId],
  );
  const page = await state.tpoCtx.newPage();
  try {
    // The college layout streams behind loading.tsx, so Next sends 200 with the not-found page in the body: the proof is the body.
    await page.goto(new URL(`/college/students/${state.otherCollegeStudent.id}`, baseUrl()).toString());
    const html = await page.content();
    expectText(html, /Page not found/, "the officer's student page for another college's student is the not-found page");
    expectNoText(html, new RegExp(state.otherCollegeStudent.email.replace(/[.+]/g, "\\$&")), "no email of the other college's student");
    expectNoText(html, new RegExp(`Other${state.tag}`), "no name of the other college's student");
  } finally {
    await page.close();
  }
  const artifact = await send(state.tpoCtx, "GET", `/api/college/students/${state.otherCollegeStudent.id}/report`);
  assert.equal(artifact.status, 404);

  // Admin routes address rows by college + id: a roster row or import of college A under college B's URL is not found.
  const aRow = (await dbRoster(state.collegeId))[0];
  const cross = await send(state.adminCtx, "PATCH", `/api/admin/colleges/${state.b.collegeId}/roster/${aRow.id}/match`, { action: "reject" });
  assert.equal(cross.status, 404, JSON.stringify(cross.body));
  const crossImport = await send(state.adminCtx, "PATCH", importUrl(state.b.collegeId, state.import1), { action: "discard" });
  assert.equal(crossImport.status, 404, "an import of college A under college B is not found");

  // The officer cannot reach the admin routes at all, and a student cannot either.
  const tpoUpload = await send(state.tpoCtx, "POST", importUrl(state.collegeId), { fileName: "x.csv", fileBase64: b64("a,b\n") });
  assert.ok([401, 403].includes(tpoUpload.status), `an officer is not an admin (got ${tpoUpload.status})`);
  const studentCtx = await signedInContext(browser, state.unverified);
  try {
    const s = await send(studentCtx, "POST", importUrl(state.collegeId), { fileName: "x.csv", fileBase64: b64("a,b\n") });
    assert.ok([401, 403].includes(s.status), `a student is not an admin (got ${s.status})`);
    const noCsrf = await state.adminCtx.request.post(new URL(importUrl(state.collegeId), baseUrl()).toString(), {
      data: { fileName: "x.csv", fileBase64: b64("a,b\n") }, headers: { origin: baseUrl() }, failOnStatusCode: false,
    });
    assert.equal(noCsrf.status(), 403, "an admin write without the CSRF header is refused");
  } finally {
    await studentCtx.close();
  }
});
