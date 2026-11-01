#!/usr/bin/env node
/**
 * Do it twice at once: a double click or two tabs must make ONE of it. Three
 * simultaneous requests each for: paying (one order, one invoice, one hire or
 * activation, on both sides), requesting an interview, sending an internship
 * offer and sending a full-time offer. Run against the QA server started with
 * PAYMENTS_TEST_BUTTON=1 (the test button is the instant settle that used to
 * pay three times):
 *
 *   PAYMENTS_TEST_BUTTON=1 QA_REBUILD=1 npm run qa:serve     # terminal 1
 *   node e2e/pay-race.mjs                                    # terminal 2
 *
 * Employer: qa.employer.heavy pays one accepted offer, then books, offers and
 * makes a full-time offer to candidates; rows created here are deleted after.
 * Intern: intern-hired, with its profile gaps filled and its legacy "paid" flag
 * cleared for the run, then put back. Local QA database only (db.mjs refuses anything else).
 */
import assert from "node:assert/strict";

import { closeDb, one, rows } from "./lib/db.mjs";
import { LOGIN, PERSONAS } from "./lib/personas.mjs";
import { nextIp } from "./lib/session.mjs";

const PARALLEL = 3;
const origin = process.env.E2E_BASE_URL || `http://localhost:${process.env.QA_PORT || 3500}`;

async function login(key) {
  const p = PERSONAS.find((x) => x.key === key);
  const spec = LOGIN[p.role];
  const res = await fetch(new URL(spec.api, origin), {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": nextIp() },
    body: JSON.stringify(spec.body(p)),
  });
  assert.ok(res.ok, `login ${key} → ${res.status} ${await res.text()}`);
  const jar = new Map(res.headers.getSetCookie().map((c) => c.split(";")[0].split(/=(.*)/s).slice(0, 2)));
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), csrf: jar.get("ft_csrf") };
}

async function post(session, path, body) {
  const res = await fetch(new URL(path, origin), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: session.cookie, "x-csrf-token": session.csrf, "x-forwarded-for": nextIp() },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const tally = (rs) => rs.map((r) => r.status).sort().join(",");

async function employerRace() {
  const emp = await one("select id from employers where company_email = 'qa.employer.heavy@qa.test'");
  const offer = await one("select id from proposals where employer_id = $1 and status = 'accepted' order by updated_at desc limit 1", [emp.id]);
  assert.ok(offer, "no accepted offer for qa.employer.heavy (npm run qa:seed)");
  const paidCount = async () => (await one("select count(*)::int n from employer_payments where employer_id = $1 and status = 'paid'", [emp.id])).n;
  const before = await paidCount();
  const session = await login("employer-heavy");
  const rs = await Promise.all(
    Array.from({ length: PARALLEL }, () =>
      post(session, `/api/employer/${emp.id}/payment/razorpay/order`, { currency: "INR", proposalIds: [offer.id], mode: "upfront", testPay: true }),
    ),
  );
  const after = await paidCount();
  const invoices = await rows("select invoice_number from employer_payments where employer_id = $1 and status = 'paid' order by paid_at desc limit 5", [emp.id]);
  const pr = await one("select status from proposals where id = $1", [offer.id]);
  console.log(`employer: statuses ${tally(rs)} · new paid rows ${after - before} · latest invoices ${invoices.map((r) => r.invoice_number).slice(0, Math.max(1, after - before))} · offer ${pr.status}`);
  console.log(`          refusals: ${JSON.stringify(rs.filter((r) => r.status !== 200).map((r) => r.body.error))}`);
  assert.equal(rs.filter((r) => r.status === 200).length, 1, `exactly one 200, got ${tally(rs)}`);
  assert.ok(rs.every((r) => [200, 400, 409].includes(r.status)), `unexpected status ${tally(rs)}`);
  assert.equal(after - before, 1, "one paid order");
  assert.equal(pr.status, "hired");
  return { emp, session, offerId: offer.id };
}

const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Candidates with a profile, for the offer and interview races; a 404/400 means this one isn't in the pool. */
const candidates = async () => (await rows("select u.id from users u join intern_onboarding o on o.user_id = u.id where u.role = 'intern' and u.is_active order by u.created_at limit 40")).map((r) => r.id);

async function interviewRace({ emp, session }, since) {
  const slots = { slot1: `${day(6)}T10:00`, slot2: `${day(6)}T11:00`, slot3: `${day(6)}T12:00`, timezone: "Asia/Kolkata" };
  for (const internId of await candidates()) {
    const rs = await Promise.all(Array.from({ length: PARALLEL }, () => post(session, `/api/employer/${emp.id}/interviews`, { internId, ...slots })));
    if (!rs.some((r) => r.status === 201)) continue;
    const n = (await one("select count(*)::int n from interviews where employer_id = $1 and intern_id = $2 and created_at >= $3::timestamp", [emp.id, internId, since])).n;
    console.log(`interview: statuses ${tally(rs)} · pending rows ${n}`);
    assert.equal(rs.filter((r) => r.status === 201).length, 1, `exactly one 201, got ${tally(rs)}`);
    assert.equal(n, 1, "one interview row");
    return;
  }
  assert.fail("no candidate accepted an interview request");
}

async function proposalRace({ emp, session }, since) {
  const [project] = await rows("select id from projects where employer_id = $1 and status = 'active' limit 1", [emp.id]);
  const body = {
    flowType: "direct", agreedToPolicy: true, roleTitle: "Race test role", jd: "Race test.", mode: "remote",
    startDate: day(20), duration: "1m", shiftFrom: "09:00", shiftTo: "18:00", timezone: "Asia/Kolkata", laptop: "company",
    paidLeavesPerMonth: 0, skills: [], projectId: project.id,
  };
  let tried = 0;
  for (const internId of await candidates()) {
    const rs = await Promise.all(Array.from({ length: PARALLEL }, () => post(session, `/api/employer/${emp.id}/proposals`, { ...body, internId })));
    if (!rs.some((r) => r.status === 201)) { tried++; continue; }
    const n = (await one("select count(*)::int n from proposals where employer_id = $1 and intern_id = $2 and created_at >= $3::timestamp", [emp.id, internId, since])).n;
    console.log(`proposal:  statuses ${tally(rs)} · live offers ${n} (skipped ${tried} candidates not eligible)`);
    assert.equal(rs.filter((r) => r.status === 201).length, 1, `exactly one 201, got ${tally(rs)}`);
    assert.equal(n, 1, "one proposal row");
    return;
  }
  assert.fail(`no candidate accepted an offer (${tried} tried; need one with an AI score and no live offer)`);
}

async function fullTimeRace({ emp, session, offerId }, since) {
  const body = {
    proposalId: offerId, jobTitle: "Race test engineer", jobMode: "remote", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "18:00",
    ctcCurrency: "INR", annualCtc: 600000, offerLetterKey: `${emp.id.replace(/[^a-z0-9_-]/gi, "").slice(0, 32)}-race-letter.pdf`,
  };
  const rs = await Promise.all(Array.from({ length: PARALLEL }, () => post(session, `/api/employer/${emp.id}/full-time-offer`, body)));
  const n = (await one("select count(*)::int n from proposals where employer_id = $1 and offer_details ? 'fullTimeOffer' and created_at >= $2::timestamp", [emp.id, since])).n;
  console.log(`full-time: statuses ${tally(rs)} · offers ${n}`);
  assert.equal(rs.filter((r) => r.status === 201).length, 1, `exactly one 201, got ${tally(rs)}: ${JSON.stringify(rs.map((r) => r.body.error))}`);
  assert.equal(n, 1, "one full-time offer");
}

/**
 * intern-hired is complete except what the QA scrub removed (Aadhaar and PAN
 * numbers, the PAN image). Those are filled for the run and put back after,
 * along with the legacy "paid" flag.
 */
async function internRace() {
  const persona = PERSONAS.find((x) => x.key === "intern-hired");
  const u = await one("select id from users where email = $1", [persona.email]);
  const ob = await one("select id, extra_data, aadhaar_number, pan_number from intern_onboarding where user_id = $1", [u.id]);
  const doc = await one("select id, pan_image_name from intern_document where user_id = $1 order by created_at desc limit 1", [u.id]);
  const cleared = { ...ob.extra_data, payment: { ...(ob.extra_data.payment ?? {}), isPaid: false } };
  await rows("update intern_onboarding set extra_data = $1, aadhaar_number = $2, pan_number = $3 where id = $4", [cleared, "999900001111", "RACET0001X", ob.id]);
  let insertedDoc = null;
  if (doc) await rows("update intern_document set pan_image_name = 'race-test.png' where id = $1", [doc.id]);
  else insertedDoc = (await one("insert into intern_document (user_id, pan_image_name) values ($1, 'race-test.png') returning id", [u.id])).id;
  const paidCount = async () => (await one("select count(*)::int n from intern_payments where intern_id = $1 and status = 'paid'", [u.id])).n;
  try {
    const before = await paidCount();
    const session = await login("intern-hired");
    const rs = await Promise.all(
      Array.from({ length: PARALLEL }, () => post(session, `/api/intern/${u.id}/payment/razorpay/order`, { testPay: true })),
    );
    const after = await paidCount();
    console.log(`intern:   statuses ${tally(rs)} · new paid rows ${after - before}`);
    console.log(`          refusals: ${JSON.stringify(rs.filter((r) => r.status !== 200).map((r) => r.body.error))}`);
    assert.equal(rs.filter((r) => r.status === 200).length, 1, `exactly one 200, got ${tally(rs)}`);
    assert.equal(after - before, 1, "one paid activation");
  } finally {
    await rows("delete from intern_payments where intern_id = $1 and gateway = 'test'", [u.id]);
    await rows("update intern_onboarding set extra_data = $1, aadhaar_number = $2, pan_number = $3 where id = $4", [ob.extra_data, ob.aadhaar_number, ob.pan_number, ob.id]);
    if (insertedDoc) await rows("delete from intern_document where id = $1", [insertedDoc]);
    else await rows("update intern_document set pan_image_name = $1 where id = $2", [doc.pan_image_name, doc.id]);
  }
}

// The columns are timestamp-without-zone in UTC; node-pg would send a Date in local time.
const started = new Date(Date.now() - 2000).toISOString().replace("T", " ").replace("Z", "");
let employer;
try {
  await internRace();
  employer = await employerRace();
  await interviewRace(employer, started);
  await proposalRace(employer, started);
  await fullTimeRace(employer, started);
  console.log("PAY-RACE PASS");
} catch (e) {
  console.error("PAY-RACE FAIL:", e.message);
  process.exitCode = 1;
} finally {
  // What the races made, so the QA data is as it was (the paid order stays: it is a real settlement).
  if (employer) {
    await rows("delete from interviews where employer_id = $1 and created_at >= $2::timestamp", [employer.emp.id, started]);
    await rows("delete from proposals where employer_id = $1 and created_at >= $2::timestamp and status in ('sent','draft')", [employer.emp.id, started]);
  }
  await closeDb();
}
