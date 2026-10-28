#!/usr/bin/env node
/**
 * QA data situations, in a LOCAL database only.
 *
 *   DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa node e2e/seed-situations.mjs
 *
 * 1. SCRUB: every real name, email, phone, Aadhaar, PAN, bank detail and
 *    free-text message in the copied live data is replaced with synthetic
 *    values. Screenshots under docs/qa/baseline/ are committed to a public
 *    repo, so no page the crawler photographs may carry a real person.
 *    (Skipped with --no-scrub; the scrub is idempotent.)
 * 2. SITUATIONS: accounts in the shapes pages must survive (see
 *    lib/personas.mjs): empty profile, one item, 50+ items, 200-char / Hinglish
 *    / emoji text, a USD employer, a score below 6, a hidden intern.
 *
 * Re-running replaces the situation accounts, never touches anything else.
 * Refuses unless DATABASE_URL is on loopback.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { hash } from "@node-rs/argon2";

import { PERSONAS } from "./lib/personas.mjs";
import { pngBase64 } from "./lib/browser.mjs";
import { closeDb, db, one, rows } from "./lib/db.mjs";
import { ARTIFACTS, ROOT } from "./lib/env.mjs";

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const log = (...a) => console.log("[seed]", ...a);
const DAY = 86_400_000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();
const dateOnly = (offsetDays) => iso(offsetDays).slice(0, 10);

const LONG_NAME = "Venkata Subramanyam Lakshmi-Narasimha Ramachandra Bhattacharya-Chattopadhyay Gopalakrishnan Parameswaran Vishwanathan Krishnamurthy Raghunathan Balasubramanian Padmanabhan Iyengar Sundaram";
const LONG_COMPANY = "Bharatiya Anusandhan Evam Vikas Pratishthan Private Limited, Maharashtra Industrial Development Corporation Technology Park Phase Two Wing C Tower Four";
const HINGLISH = "Mai ek hardworking aur curious student hu, jo data analysis aur web development mein interested hai. Mujhe naye tools seekhna pasand hai 🚀 — kaam time pe aur ekdum clean karta hu. Chai pe charcha bhi chalegi ☕ 你好 مرحبا";

async function scrub() {
  log("scrubbing real PII from the copied data…");
  const sql = [
    // Interns
    `WITH n AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM users)
     UPDATE users u SET first_name = 'Intern', last_name = 'No' || n.n,
       email = 'intern' || n.n || '@qa.invalid', phone_number = lpad((9000000000 + n.n)::text, 10, '0'),
       password = '!scrubbed' FROM n WHERE n.id = u.id AND u.email NOT LIKE '%@qa.invalid' AND u.email NOT LIKE '%@qa.test' AND u.email NOT LIKE '%@jklu.edu.in' AND u.email <> 'ritika.launchtest@gmail.com'`,
    `UPDATE intern_onboarding SET linkedin_url = NULL, aadhaar_number = NULL, pan_number = NULL,
       bio = CASE WHEN bio IS NULL OR bio = '' THEN bio ELSE 'Curious learner who likes building small projects and shipping them.' END,
       experience_json = CASE WHEN jsonb_array_length(COALESCE(experience_json, '[]'::jsonb)) = 0 THEN '[]'::jsonb
         ELSE jsonb_build_array(jsonb_build_object('id','exp-1','company','Sample Co','role','Intern','description','Worked on a small team project.','startDate','2025-06','endDate','2025-08','current',false)) END,
       extra_data = (COALESCE(extra_data,'{}'::jsonb) - 'bankDetails' - 'emergencyPhone' - 'secondPocPhone')
         || jsonb_build_object('emergencyPhone','9000000000')
         || CASE WHEN extra_data ? 'academics' THEN jsonb_build_object('academics',
              (extra_data->'academics') || jsonb_build_object('institution','Sample University','marksheetUploads','[]'::jsonb)) ELSE '{}'::jsonb END
         || CASE WHEN extra_data ? 'payment' THEN jsonb_build_object('payment', (extra_data->'payment') - 'paymentId' - 'orderId') ELSE '{}'::jsonb END`,
    `UPDATE intern_document SET aadhaar_image_name = NULL, pan_image_name = NULL, intro_video_name = NULL,
       profile_photo_name = CASE WHEN profile_photo_name IS NULL THEN NULL ELSE 'qa-photo.png' END,
       profile_photo_type = CASE WHEN profile_photo_name IS NULL THEN profile_photo_type ELSE 'image/png' END`,
    // Employers (the system row 'admin' is the AI interviewer, not a person)
    `WITH n AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM employers WHERE id <> 'admin')
     UPDATE employers e SET name = 'Employer ' || n.n, company_name = 'Company ' || n.n,
       company_email = 'employer' || n.n || '@qa.invalid', phone_number = lpad((8000000000 + n.n)::text, 10, '0'),
       password = '!scrubbed', logo_url = NULL, website_url = NULL, primary_contact_name = 'Contact ' || n.n,
       escalation_contact_name = NULL, escalation_contact_email = NULL, escalation_contact_phone = NULL,
       bank_name = NULL, account_number = NULL, account_holder_name = NULL, ifsc_code = NULL, swift_code = NULL,
       gst_number = NULL FROM n WHERE n.id = e.id AND e.company_email NOT LIKE '%@qa.invalid' AND e.company_email NOT LIKE '%@qa.test' AND e.company_email <> 'neha@acmerobotics-launchtest.in'`,
    `WITH n AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM admins)
     UPDATE admins a SET email = 'staff' || n.n || '@qa.invalid', name = 'Staff ' || n.n, password = '!scrubbed'
       FROM n WHERE n.id = a.id AND a.email NOT LIKE '%@qa.invalid' AND a.email <> 'e2e-admin@findtern.test'`,
    // Free text and tokens
    `UPDATE notifications SET message = title || ' (details omitted)', data = COALESCE(data - 'email' - 'name', '{}'::jsonb)`,
    `UPDATE contact_messages SET first_name = 'Visitor', last_name = 'QA', email = 'visitor@qa.invalid', phone = NULL, subject = 'Subject omitted', message = 'Message omitted from the QA copy.'`,
    `UPDATE interviews SET notes = NULL, meeting_link = NULL`,
    `UPDATE intern_payments SET raw = '{}'::jsonb, signature = NULL, payment_id = NULL`,
    `UPDATE employer_payments SET raw = '{}'::jsonb, signature = NULL, payment_id = NULL`,
    `UPDATE intern_payouts SET raw = '{}'::jsonb, notes = NULL, reference_id = NULL`,
    `UPDATE timesheets SET intern_note = NULL, manager_note = NULL`,
    `DELETE FROM email_otps`,
    `DELETE FROM password_reset_tokens`,
    `DELETE FROM employer_google_tokens`,
    `DELETE FROM admin_audit_log`,
  ];
  for (const s of sql) {
    // Optional tables/columns differ between schema versions; a miss is reported, not hidden.
    try {
      await db().query(s);
    } catch (e) {
      log(`  scrub statement failed: ${e.message.split("\n")[0]}\n    ${s.slice(0, 90).replace(/\s+/g, " ")}…`);
      throw e;
    }
  }
}

function extraFor({ score = 8, approval = "Approved", openToWork = true, longText = false, bank = true } = {}) {
  const t = longText ? HINGLISH : undefined;
  return {
    payment: { isPaid: true, paidAt: iso(-20), gateway: "free", orderId: "qa_free", paymentId: null, promoCode: null, finalAmountMinor: 0, discountAmountMinor: 0, originalAmountMinor: 249900 },
    ratings: { aptitude: score, interview: score, communication: score, coding: score },
    findternScore: score,
    approvalStatus: approval,
    approvedAt: iso(-10),
    approvedBy: "qa-seed",
    academics: {
      level: "bachelors", score: "8.4", degree: "B.Tech", status: "Pursuing", endYear: "2027", scoreType: "cgpa",
      startYear: "2023", institution: longText ? LONG_COMPANY.slice(0, 120) : "Sample University", certifications: [],
      specialization: "Computer Science", marksheetUploads: [], professionalCourses: [],
    },
    languages: [
      { id: "lang-en", language: "english", level: "professional", read: "yes", write: "yes", speak: "yes" },
      { id: "lang-hi", language: "hindi", level: "native", read: "yes", write: "yes", speak: "yes" },
    ],
    extracurricular: [{ id: "act-1", activity: t ? t.slice(0, 60) : "Chess", level: "Intermediate" }],
    emergencyPhone: "9000000001", emergencyCountryCode: "+91", secondPocPhone: null, secondPocCountryCode: "+91",
    ...(bank ? { bankDetails: { bankName: "QA Bank", ifscCode: "QABK0000001", accountNumber: "000000000001", accountHolderName: "QA Holder", upiId: null } } : {}),
    ndaAcceptedAt: iso(-25),
    profileSubmittedAt: iso(-25),
    openToWork,
  };
}

async function wipe(email, table, emailCol) {
  const found = await rows(`SELECT id FROM ${table} WHERE lower(${emailCol}) = lower($1)`, [email]);
  for (const { id } of found) {
    await db().query(`DELETE FROM notifications WHERE recipient_id = $1`, [id]);
    if (table === "users") {
      for (const t of ["intern_onboarding", "intern_document", "intern_payments", "intern_payouts"]) {
        await db().query(`DELETE FROM ${t} WHERE ${t === "intern_payments" || t === "intern_payouts" ? "intern_id" : "user_id"} = $1`, [id]);
      }
      for (const t of ["interviews", "proposals", "timesheets"]) await db().query(`DELETE FROM ${t} WHERE intern_id = $1`, [id]);
    } else if (table === "employers") {
      await db().query(`DELETE FROM timesheets WHERE employer_id = $1`, [id]);
      for (const t of ["interviews", "proposals", "projects", "employer_cart_items", "employer_payments", "profile_views"]) {
        await db().query(`DELETE FROM ${t} WHERE employer_id = $1`, [id]);
      }
    }
    await db().query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  }
}

let phoneSeq = 7000000000;
const nextPhone = () => String(phoneSeq++);

async function mkIntern(p, { first = "Qa", last = "Intern", extra, onboarding = true, visibility = "live", skills, experience, docs = true } = {}) {
  await wipe(p.email, "users", "email");
  const pw = await hash(p.password, ARGON);
  const u = await one(
    `INSERT INTO users (first_name, last_name, email, email_verified, is_active, country_code, phone_number, password, agreed_to_terms, role, profile_visibility)
     VALUES ($1,$2,$3,true,true,'+91',$4,$5,true,'intern',$6) RETURNING id`,
    [first, last, p.email, nextPhone(), pw, visibility],
  );
  if (onboarding) {
    await db().query(
      `INSERT INTO intern_onboarding (user_id, pin_code, state, city, aadhaar_number, pan_number, bio, experience_json, skills, location_types, preferred_locations, has_laptop, extra_data)
       VALUES ($1,'560001','Karnataka','Bengaluru',$2,$3,$4,$5,$6,$7,$8,true,$9)`,
      [
        u.id,
        String(Math.floor(100000000000 + Math.random() * 899999999999)),
        "QAPAN" + String(Math.floor(1000 + Math.random() * 8999)) + "Z",
        extra?.__bio ?? "Curious learner who likes building small projects and shipping them.",
        JSON.stringify(experience ?? [{ id: "exp-1", company: "Sample Co", role: "Intern", description: "Worked on a small team project.", startDate: "2025-06", endDate: "2025-08", current: false }]),
        JSON.stringify(skills ?? ["React", "Node.js", "SQL", "Python", "Figma"]),
        JSON.stringify(["remote", "hybrid"]),
        JSON.stringify(["Bengaluru", "Mumbai"]),
        JSON.stringify((({ __bio, ...rest }) => rest)(extra ?? extraFor())),
      ],
    );
    if (docs) {
      await db().query(
        `INSERT INTO intern_document (user_id, profile_photo_name, profile_photo_type, profile_photo_size, aadhaar_image_name, aadhaar_image_type, aadhaar_image_size, pan_image_name, pan_image_type, pan_image_size)
         VALUES ($1,'qa-photo.png','image/png',1200,NULL,NULL,NULL,NULL,NULL,NULL)`,
        [u.id],
      );
    }
  }
  return u.id;
}

async function mkEmployer(p, { name = "Neha QA", company = "Acme Robotics QA", country = "India", complete = true, intl = false } = {}) {
  await wipe(p.email, "employers", "company_email");
  const pw = await hash(p.password, ARGON);
  const e = await one(
    `INSERT INTO employers (name, company_name, company_email, email_verified, country_code, phone_number, password, agreed_to_terms,
       website_url, company_size, country, city, state, billing_pincode, primary_contact_name, primary_contact_role, setup_completed, onboarding_completed, is_active)
     VALUES ($1,$2,$3,true,$4,$5,$6,true,'https://example.com','11-50',$7,'Bengaluru','Karnataka','560001',$1,'Founder',$8,$8,true) RETURNING id`,
    [name, company, p.email, intl ? "+1" : "+91", nextPhone(), pw, country, complete],
  );
  return e.id;
}

async function mkProject(employerId, name, i = 0) {
  const r = await one(
    `INSERT INTO projects (employer_id, project_name, skills, scope_of_work, full_time_offer, location_type, preferred_locations, city, state, timezone, status)
     VALUES ($1,$2,$3,$4,$5,$6,'[]','Bengaluru','Karnataka','Asia/Kolkata','active') RETURNING id`,
    [employerId, name, JSON.stringify(["React", "SQL", "Python"].slice(0, 1 + (i % 3))), ["short-term", "medium-term", "long-term"][i % 3], i % 2 === 0, ["remote", "onsite", "hybrid"][i % 3]],
  );
  return r.id;
}

const offer = (i, currency = "INR", roleTitle = "Product Intern") => ({
  jd: "<p>Own a small slice of the product. Weekly demos.</p>", mode: "remote", laptop: "candidate", shiftTo: "18:00", currency,
  duration: ["2m", "3m", "6m"][i % 3], location: "Remote", timezone: "Asia/Kolkata", roleTitle, shiftFrom: "09:00",
  startDate: dateOnly(7 + i), totalPrice: currency === "USD" ? 600 : 24000, hourlyRate: currency === "USD" ? 6 : 150, monthlyHours: 176,
  monthlyAmount: currency === "USD" ? 1056 : 26400, weeklySchedule: "mon_fri", workFromHomeDays: 0, paidLeavesPerMonth: 1, workFromOfficeDays: 0,
});

async function mkProposal({ employerId, internId, projectId, status, currency = "INR", i = 0, roleTitle, startOffset }) {
  const o = offer(i, currency, roleTitle);
  if (startOffset !== undefined) o.startDate = dateOnly(startOffset);
  const hired = status === "hired";
  const r = await one(
    `INSERT INTO proposals (employer_id, intern_id, project_id, flow_type, status, currency, offer_details, ai_ratings, skills, hired_at, created_at, updated_at)
     VALUES ($1,$2,$3,'direct',$4,$5,$6,'{"coding":7,"overall":8,"aptitude":8,"communication":8}','["React","SQL"]',$7,$8,$8) RETURNING id`,
    [employerId, internId, projectId, status, currency, JSON.stringify(o), hired ? iso(-30 + (i % 20)) : null, iso(-30 + (i % 25))],
  );
  return r.id;
}

async function mkInterview({ employerId, internId, projectId, status, i = 0 }) {
  const future = status === "scheduled" || status === "pending";
  const base = future ? 2 + (i % 20) : -2 - (i % 20);
  await db().query(
    `INSERT INTO interviews (employer_id, intern_id, project_id, status, slot1, slot2, slot3, selected_slot, timezone, meeting_link, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Asia/Kolkata',$9,$10)`,
    [employerId, internId, projectId, status, iso(base), iso(base + 1), iso(base + 2), status === "pending" ? null : 1,
     status === "scheduled" ? "https://meet.example.com/qa-room" : null, status === "completed" ? "Strong communication, ok depth." : null],
  );
}

async function mkNotes(recipientType, id, n, longText = false) {
  for (let i = 0; i < n; i++) {
    await db().query(
      `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data, is_read, created_at) VALUES ($1,$2,$3,$4,$5,'{}',$6,$7)`,
      [recipientType, id, ["info", "proposal", "interview"][i % 3], longText ? `Hinglish update ${i} 🚀 ` + HINGLISH.slice(0, 40) : `QA notification ${i + 1}`,
       longText ? HINGLISH : `Message body number ${i + 1} for list-density checks.`, i % 3 === 0, iso(-i / 4)],
    );
  }
}

// Timesheet periods as the app anchors them (src/lib/employer-timesheets.ts
// engagementPeriods): one per engagement month from the joining date
// (18 Sep -> 17 Oct, 18 Oct -> 17 Nov), consecutive. Fixed 30-day sheets left
// one-day gaps the app then offered as a period of its own (QA-152).
function addDaysIso(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMonthsIso(isoDate, n) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
const offsetOf = (isoDate) => Math.round((Date.parse(isoDate + "T00:00:00Z") - Date.parse(dateOnly(0) + "T00:00:00Z")) / DAY);

/** Sheet `period` (0 = first month) of an engagement that joined `joiningOffset` days from today. */
async function mkTimesheet({ proposalId, employerId, internId, status, joiningOffset, period = 0 }) {
  const joining = dateOnly(joiningOffset);
  const start = addMonthsIso(joining, period);
  const end = addDaysIso(addMonthsIso(joining, period + 1), -1);
  const entries = [];
  for (let date = start; date <= end; date = addDaysIso(date, 1)) {
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    // The app's own words (QA-133): "Present" / "Fixed off", with the hours a
    // real sheet carries, so the review screen tallies them like a submission.
    const weekend = dow === 0 || dow === 6;
    const dayStatus = weekend ? "Fixed off" : status === "draft" ? "" : "Present";
    entries.push({ date, hours: dayStatus === "Present" ? 8 : 0, note: "", status: dayStatus });
  }
  const after = offsetOf(end) + 1;
  await db().query(
    `INSERT INTO timesheets (proposal_id, employer_id, intern_id, period_start, period_end, status, entries, submitted_at, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [proposalId, employerId, internId, start, end, status, JSON.stringify(entries),
     status === "draft" ? null : iso(after), status === "approved" ? iso(after + 1) : null],
  );
}

async function mkPayout(internId, i, status = "paid") {
  await db().query(
    `INSERT INTO intern_payouts (intern_id, amount_minor, currency, status, method, reference_id, paid_at, created_at)
     VALUES ($1,$2,'INR',$3,'bank',$4,$5,$6)`,
    [internId, 1500000 + i * 1000, status, status === "paid" ? `QAREF${i}` : null, status === "paid" ? iso(-i) : null, iso(-i)],
  );
}

async function seedPersonas() {
  const by = Object.fromEntries(PERSONAS.map((p) => [p.key, p]));
  const out = {};

  // --- Employers first: interns hang proposals off them. ---
  out.employerMain = await mkEmployer(by["employer-main"], { name: "Neha Sharma", company: "Acme Robotics" });
  out.employerEmpty = await mkEmployer(by["employer-empty"], { name: "Empty Employer", company: "Empty Co" });
  out.employerOne = await mkEmployer(by["employer-one"], { name: "One Employer", company: "One Item Co" });
  out.employerHeavy = await mkEmployer(by["employer-heavy"], { name: "Heavy Employer", company: "Heavy Data Co" });
  out.employerUsd = await mkEmployer(by["employer-usd"], { name: "Dana US", company: "Globex Inc", country: "United States", intl: true });
  out.employerLong = await mkEmployer(by["employer-longtext"], { name: LONG_NAME, company: LONG_COMPANY });

  // --- Hired intern (ritika) + the main employer's pipeline. ---
  out.internHired = await mkIntern(by["intern-hired"], { first: "Ritika", last: "Verma", extra: extraFor({ score: 8 }) });
  const mainProj = await mkProject(out.employerMain, "Robotics Software Intern", 0);
  const mainProj2 = await mkProject(out.employerMain, "Data Analyst Intern", 1);
  const hiredProp = await mkProposal({ employerId: out.employerMain, internId: out.internHired, projectId: mainProj, status: "hired", i: 1, startOffset: -40 });
  await mkTimesheet({ proposalId: hiredProp, employerId: out.employerMain, internId: out.internHired, status: "approved", joiningOffset: -40 });
  await mkTimesheet({ proposalId: hiredProp, employerId: out.employerMain, internId: out.internHired, status: "draft", joiningOffset: -40, period: 1 });
  await mkPayout(out.internHired, 1);
  await db().query(
    `INSERT INTO employer_payments (employer_id, gateway, order_id, amount_minor, currency, status, paid_at, invoice_number)
     VALUES ($1,'free','qa_order_main',0,'INR','paid',$2,NULL)`, [out.employerMain, iso(-30)]);
  // pending items for the main employer + intern
  const sentIntern = await mkIntern({ email: "qa.intern.pool1@qa.test", password: "Qa#Situations2026" }, { first: "Pool", last: "One", extra: extraFor({ score: 7.5 }) });
  await mkProposal({ employerId: out.employerMain, internId: sentIntern, projectId: mainProj2, status: "sent", i: 2 });
  await mkProposal({ employerId: out.employerMain, internId: out.internHired, projectId: mainProj2, status: "sent", i: 3 });
  await mkInterview({ employerId: out.employerMain, internId: out.internHired, projectId: mainProj, status: "scheduled", i: 1 });
  await mkInterview({ employerId: out.employerMain, internId: sentIntern, projectId: mainProj2, status: "pending", i: 2 });
  await mkInterview({ employerId: out.employerMain, internId: sentIntern, projectId: mainProj2, status: "completed", i: 3 });
  await mkNotes("intern", out.internHired, 12);
  await mkNotes("employer", out.employerMain, 12);
  await db().query(`INSERT INTO employer_cart_items (employer_id, project_id, intern_id, list_type) VALUES ($1,$2,$3,'cart')`, [out.employerMain, mainProj2, sentIntern]);

  // --- Intern situations. ---
  out.internEmpty = await mkIntern(by["intern-empty"], { first: "Empty", last: "Profile", onboarding: false });
  out.internOne = await mkIntern(by["intern-one"], { first: "One", last: "Item", extra: extraFor({ score: 7 }), skills: ["React"], experience: [] });
  {
    const p1 = await mkProject(out.employerOne, "Single Project", 0);
    await mkProposal({ employerId: out.employerOne, internId: out.internOne, projectId: p1, status: "sent", i: 0 });
    await mkInterview({ employerId: out.employerOne, internId: out.internOne, projectId: p1, status: "pending", i: 0 });
    await mkNotes("intern", out.internOne, 1);
    await mkNotes("employer", out.employerOne, 1);
  }

  const heavySkills = Array.from({ length: 60 }, (_, i) => `Skill ${i + 1}`);
  const heavyExp = Array.from({ length: 12 }, (_, i) => ({ id: `exp-${i}`, company: `Company ${i + 1}`, role: `Role ${i + 1}`, description: "Shipped things. ".repeat(12), startDate: "2024-01", endDate: "2024-06", current: false }));
  out.internHeavy = await mkIntern(by["intern-heavy"], { first: "Heavy", last: "Data", extra: extraFor({ score: 9 }), skills: heavySkills, experience: heavyExp });
  {
    const projs = [];
    for (let i = 0; i < 55; i++) projs.push(await mkProject(out.employerHeavy, `Heavy Project ${i + 1}`, i));
    const statuses = ["sent", "accepted", "rejected", "hired", "sent"];
    const heavyInterns = [];
    for (let i = 0; i < 8; i++) heavyInterns.push(await mkIntern({ email: `qa.intern.heavy-pool${i}@qa.test`, password: SITUATION_PW }, { first: "Pool", last: `H${i}`, extra: extraFor({ score: 6 + (i % 4) }) }));
    for (let i = 0; i < 55; i++) {
      const hired = i % 11 === 0;
      const status = hired ? "hired" : statuses[i % statuses.length];
      const internId = i < 52 ? out.internHeavy : heavyInterns[i % heavyInterns.length];
      const pid = await mkProposal({ employerId: out.employerHeavy, internId, projectId: projs[i], status, i, ...(hired ? { startOffset: -40 - i } : {}) });
      await mkInterview({ employerId: out.employerHeavy, internId: out.internHeavy, projectId: projs[i], status: ["scheduled", "pending", "completed"][i % 3], i });
      if (hired && internId === out.internHeavy) await mkTimesheet({ proposalId: pid, employerId: out.employerHeavy, internId, status: ["approved", "submitted", "draft"][(i / 11) % 3 | 0], joiningOffset: -40 - i });
      await mkPayout(out.internHeavy, i, i % 4 === 0 ? "pending" : "paid");
      if (i < 50) await db().query(`INSERT INTO employer_cart_items (employer_id, project_id, intern_id, list_type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [out.employerHeavy, projs[i], heavyInterns[i % heavyInterns.length], i % 2 ? "cart" : "shortlist"]);
    }
    await mkNotes("intern", out.internHeavy, 120);
    await mkNotes("employer", out.employerHeavy, 120);
  }

  out.internLong = await mkIntern(by["intern-longtext"], {
    first: LONG_NAME.slice(0, 100), last: LONG_NAME.slice(100, 200), extra: { ...extraFor({ score: 8, longText: true }), __bio: HINGLISH.repeat(3) },
    skills: ["Ek bahut lamba skill naam jo line todta hai aur UI ko test karta hai " + "x".repeat(80), "React 🚀", "データ分析", "C++/C#/.NET"],
    experience: [{ id: "exp-1", company: LONG_COMPANY, role: LONG_NAME.slice(0, 100), description: HINGLISH, startDate: "2025-01", endDate: "2025-06", current: false }],
  });
  {
    const p1 = await mkProject(out.employerLong, LONG_COMPANY.slice(0, 120), 0);
    await mkProposal({ employerId: out.employerLong, internId: out.internLong, projectId: p1, status: "sent", i: 0, roleTitle: LONG_NAME.slice(0, 120) });
    await mkInterview({ employerId: out.employerLong, internId: out.internLong, projectId: p1, status: "pending", i: 0 });
    await mkNotes("intern", out.internLong, 4, true);
    await mkNotes("employer", out.employerLong, 4, true);
  }

  out.internLow = await mkIntern(by["intern-lowscore"], { first: "Low", last: "Score", extra: extraFor({ score: 4.5, approval: "Pending" }) });
  out.internHidden = await mkIntern(by["intern-hidden"], { first: "Hidden", last: "ByAdmin", extra: extraFor({ score: 8 }), visibility: "hidden" });

  // --- USD employer with a USD offer and interview. ---
  {
    const p1 = await mkProject(out.employerUsd, "US Contractor Intern", 0);
    const usdIntern = await mkIntern({ email: "qa.intern.usd-pool@qa.test", password: SITUATION_PW }, { first: "Usd", last: "Pool", extra: extraFor({ score: 8 }) });
    await mkProposal({ employerId: out.employerUsd, internId: usdIntern, projectId: p1, status: "sent", currency: "USD", i: 0 });
    await mkProposal({ employerId: out.employerUsd, internId: usdIntern, projectId: p1, status: "accepted", currency: "USD", i: 1 });
    await mkInterview({ employerId: out.employerUsd, internId: usdIntern, projectId: p1, status: "scheduled", i: 0 });
    await mkNotes("employer", out.employerUsd, 3);
  }

  // --- Admin: super admin with the plan's login. ---
  await db().query(`DELETE FROM admins WHERE lower(email) = lower($1)`, [by.admin.email]);
  await db().query(`INSERT INTO admins (email, password, name, role) VALUES ($1,$2,'QA Super Admin','super_admin')`, [by.admin.email, await hash(by.admin.password, ARGON)]);
  return out;
}

const SITUATION_PW = "Qa#Situations2026";

/**
 * College Partners: scripts/seed-colleges.ts (synthetic JKLU roster, officer, a live
 * drive; its link is written to e2e/.artifacts/qa-college.json), then my personas are
 * put into that drive so /employer/drives, /intern/college and the call states have data.
 */
async function seedCollege(ids) {
  mkdirSync(ARTIFACTS, { recursive: true });
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/seed-colleges.ts"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? "http://localhost:3500", COLLEGE_DEV_FILE: join(ARTIFACTS, "qa-college.json"), NODE_ENV: "development" },
  });
  if (r.status !== 0) throw new Error("scripts/seed-colleges.ts failed");
  const drive = await one(`SELECT id, college_id FROM college_drives ORDER BY created_at DESC LIMIT 1`);
  if (!drive) return;
  for (const eid of [ids.employerMain, ids.employerHeavy]) {
    await db().query(`INSERT INTO college_drive_employers (drive_id, employer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [drive.id, eid]);
  }
  // The hired intern is a verified JKLU student, with consent.
  const consent = await one(`SELECT notice_version, notice_hash, purposes FROM college_consents LIMIT 1`);
  await db().query(`DELETE FROM college_memberships WHERE user_id = $1`, [ids.internHired]);
  const c = await one(
    `INSERT INTO college_consents (user_id, college_id, notice_version, notice_hash, purposes, declared_adult) VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
    [ids.internHired, drive.college_id, consent.notice_version, consent.notice_hash, JSON.stringify(consent.purposes)],
  );
  await db().query(
    `INSERT INTO college_memberships (user_id, college_id, status, verified_by, year, branch, consent_id) VALUES ($1,$2,'verified','roster',3,'CSE',$3)`,
    [ids.internHired, drive.college_id, c.id],
  );
  await db().query(`INSERT INTO college_roster (college_id, email, name, roll_no, year, branch) VALUES ($1,'ritika.launchtest@gmail.com','Ritika Verma','22JK901',3,'CSE') ON CONFLICT DO NOTHING`, [drive.college_id]);
  // Accepted calls: one with a join link, one without (the QA-001 state), one still requested.
  await db().query(`DELETE FROM college_drive_meetings WHERE employer_id = $1`, [ids.employerMain]);
  const member = await rows(`SELECT user_id FROM college_memberships WHERE college_id = $1 AND user_id <> $2 LIMIT 2`, [drive.college_id, ids.internHired]);
  const calls = [
    [ids.internHired, "accepted", "https://meet.example.com/qa-drive-call"],
    [member[0]?.user_id, "accepted", null],
    [member[1]?.user_id, "requested", null],
  ].filter((x) => x[0]);
  for (const [uid, status, link] of calls) {
    await db().query(
      `INSERT INTO college_drive_meetings (drive_id, employer_id, user_id, starts_at, status, meeting_link) VALUES ($1,$2,$3,$4,$5,$6)`,
      [drive.id, ids.employerMain, uid, iso(0.01), status, link],
    );
  }
  log("college: drive, roster and calls seeded");
}

/** One neutral avatar for every seeded profile photo; the QA server's UPLOAD_ROOT (lib/qa-server.mjs). */
function writePlaceholderPhoto() {
  const dir = join(ARTIFACTS, "qa-uploads");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "qa-photo.png"), Buffer.from(pngBase64(96, [90, 120, 160]), "base64"));
}

async function main() {
  writePlaceholderPhoto();
  const meta = await one(`SELECT current_database() AS db, (SELECT count(*) FROM users)::int AS users`);
  log(`database ${meta.db} (${meta.users} users)`);
  if (!process.argv.includes("--no-scrub")) await scrub();
  const ids = await seedPersonas();
  await seedCollege(ids);
  const counts = await one(
    `SELECT (SELECT count(*) FROM users)::int users, (SELECT count(*) FROM employers)::int employers, (SELECT count(*) FROM proposals)::int proposals,
            (SELECT count(*) FROM interviews)::int interviews, (SELECT count(*) FROM timesheets)::int timesheets`);
  log("done", JSON.stringify(counts));
  log("ids", JSON.stringify(ids));
  await closeDb();
}

main().catch(async (e) => {
  console.error("[seed] FAILED:", e.message);
  await closeDb();
  process.exit(1);
});
