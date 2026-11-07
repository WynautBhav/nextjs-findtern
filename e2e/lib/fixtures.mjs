/**
 * Seeding and session helpers for the WP-E specs (messaging-presence,
 * college-roster, refunds, skills-limit, listings, bio-hidden).
 *
 * The story in critical-path.e2e.mjs builds its accounts through the signup
 * UI, which costs minutes per account. These specs test other things, so they
 * seed accounts straight into the LOCAL test database (lib/db.mjs refuses a
 * non-loopback host) the same way e2e/seed-situations.mjs does, then sign in
 * through the real login routes and drive the app from there.
 *
 * Every value carries the run id, so a spec can re-run on the same database.
 * The server runs with TRUST_PROXY=1 (e2e/run.mjs, loopback only), so each
 * login sends its own X-Forwarded-For and does not share the 8-per-15-minutes
 * login bucket.
 */
import { hash } from "@node-rs/argon2";

import { baseUrl } from "./env.mjs";
import { db, one, rows } from "./db.mjs";
import { LOGIN } from "./personas.mjs";
import { nextIp } from "./session.mjs";

export const RUN = Date.now().toString(36);
export const PASSWORD = "E2e-Wpe#2026";
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const DAY = 86_400_000;
export const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString();
export const dateOnly = (offsetDays = 0) => iso(offsetDays).slice(0, 10);

// Mirrors CURRENT_TERMS_VERSION in src/lib/terms.ts: seeded accounts have accepted it so the pop-up never blocks a step.
const TERMS_VERSION = "2026-11-06";

/** A PAN in the shape the onboarding route checks: 5 letters, 4 digits, 1 letter. */
const validPan = () => {
  const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${L()}${L()}${L()}${L()}P${String(Math.floor(1000 + Math.random() * 8999))}${L()}`;
};

let phoneSeq = 6_000_000_000 + (Date.now() % 900_000_000);
export const nextPhone = () => String(phoneSeq++);

let n = 0;
export const uniq = (label) => `${label}-${RUN}-${++n}`;

/** The extra_data blob of a profile that has everything the activation route asks for. */
export function extraFor({ score = null, paid = false, approval = "Approved" } = {}) {
  const scored = score !== null;
  return {
    payment: paid
      ? { isPaid: true, paidAt: iso(-5), gateway: "razorpay", orderId: "order_e2e", paymentId: "pay_e2e", promoCode: null, finalAmountMinor: 249900, discountAmountMinor: 0, originalAmountMinor: 249900 }
      : { isPaid: false },
    ...(scored
      ? {
          ratings: { aptitude: score, interview: score, communication: score, coding: score },
          findternScore: score,
          approvalStatus: approval,
          approvedAt: iso(-3),
          approvedBy: "e2e-seed",
        }
      : {}),
    academics: {
      level: "bachelors", score: "8.4", degree: "B.Tech", status: "Pursuing", endYear: "2027", scoreType: "cgpa",
      startYear: "2023", institution: "Sample University", certifications: [], specialization: "Computer Science",
      marksheetUploads: [], professionalCourses: [],
    },
    languages: [{ id: "lang-en", language: "english", level: "professional", read: "yes", write: "yes", speak: "yes" }],
    emergencyPhone: "9000000001", emergencyCountryCode: "+91",
    bankDetails: { bankName: "E2E Bank", ifscCode: "QABK0000001", accountNumber: "000000000001", accountHolderName: "E2E Holder", upiId: null },
    ndaAcceptedAt: iso(-10),
    profileSubmittedAt: iso(-10),
    openToWork: true,
  };
}

/**
 * An intern. `score` set → scored, approved, visible to employers once `paid`.
 * `emailVerified: false` makes a "same email, not verified" account.
 * Returns { id, email, password, firstName, lastName, phone }.
 */
export async function seedIntern({
  label = "intern",
  firstName = "Asha",
  lastName = null,
  email = null,
  phone = null,
  password = PASSWORD,
  score = null,
  paid = false,
  emailVerified = true,
  skills = ["React", "SQL", "Python"],
  bio = null,
  city = "Pune",
  hidden = false,
} = {}) {
  const em = (email ?? `${uniq(label)}@gmail.com`).toLowerCase();
  const ln = lastName ?? `Tester${RUN.slice(-4)}${++n}`;
  const ph = phone ?? nextPhone();
  const u = await one(
    `INSERT INTO users (first_name, last_name, email, email_verified, is_active, country_code, phone_number, password, agreed_to_terms, role, profile_visibility, terms_accepted_version, terms_accepted_at)
     VALUES ($1,$2,$3,$4,true,'+91',$5,$6,true,'intern',$7,$8,now()) RETURNING id`,
    [firstName, ln, em, emailVerified, ph, await hash(password, ARGON), hidden ? "hidden" : "live", TERMS_VERSION],
  );
  await db().query(
    `INSERT INTO intern_onboarding (user_id, pin_code, state, city, aadhaar_number, pan_number, bio, experience_json, skills, location_types, preferred_locations, has_laptop, extra_data)
     VALUES ($1,'411001','Maharashtra',$2,$3,$4,$5,'[]',$6,$7,$8,true,$9)`,
    [
      u.id,
      city,
      String(Math.floor(200000000000 + Math.random() * 799999999999)),
      validPan(),
      bio,
      JSON.stringify(skills),
      JSON.stringify(["remote"]),
      JSON.stringify([]),
      JSON.stringify(extraFor({ score, paid })),
    ],
  );
  await db().query(
    `INSERT INTO intern_document (user_id, profile_photo_name, profile_photo_type, profile_photo_size, pan_image_name, pan_image_type, pan_image_size)
     VALUES ($1,'e2e-photo.png','image/png',1200,'e2e-pan.webp','image/webp',1200)`,
    [u.id],
  );
  if (paid) await seedInternPayment(u.id);
  return { id: u.id, email: em, password, firstName, lastName: ln, phone: ph, role: "intern" };
}

/** A paid ₹2,499 activation by Razorpay (what the refund flow looks at; the refund guard wants pay_ + letters and digits only). */
export async function seedInternPayment(internId, { gateway = "razorpay", amountMinor = 249900, paymentId = `pay_${uniq("e2e").replace(/-/g, "")}` } = {}) {
  const orderId = `order_${uniq("e2e")}`.replace(/-/g, "_");
  const r = await one(
    `INSERT INTO intern_payments (intern_id, gateway, order_id, payment_id, amount_minor, status, paid_at, invoice_number)
     VALUES ($1,$2,$3,$4,$5,'paid',now(),$6) RETURNING id, payment_id, order_id`,
    [internId, gateway, orderId, paymentId, amountMinor, `E2E/${uniq("inv")}`],
  );
  return { id: r.id, paymentId: r.payment_id, orderId: r.order_id, amountMinor };
}

/** The AI interview row (an interview owned by the AI employer "admin") in a given status. */
export async function seedAiInterview(internId, status = "completed") {
  await db().query(
    `INSERT INTO interviews (employer_id, intern_id, status, slot1, timezone, meeting_link)
     VALUES ('admin',$1,$2,now(),'Asia/Kolkata',$3)`,
    [internId, status, status === "waiting" ? null : "https://meet.example.com/e2e-ai"],
  ).catch(async () => {
    // The legacy AI employer row may be missing in a fresh database.
    await db().query(
      `INSERT INTO employers (id, name, company_name, company_email, phone_number, password, country_code, is_active)
       VALUES ('admin','Findtern AI','Findtern AI Interview','ai-interview@findtern.ai','0000000000','!none','+91',true) ON CONFLICT (id) DO NOTHING`,
    );
    await db().query(
      `INSERT INTO interviews (employer_id, intern_id, status, slot1, timezone, meeting_link)
       VALUES ('admin',$1,$2,now(),'Asia/Kolkata',$3)`,
      [internId, status, status === "waiting" ? null : "https://meet.example.com/e2e-ai"],
    );
  });
}

export async function seedEmployer({ label = "employer", name = "Esha Employer", company = null, password = PASSWORD, active = true } = {}) {
  const email = `${uniq(label)}@e2e-company.test`;
  const companyName = company ?? `Zentrova ${label} ${RUN.toUpperCase()}${++n}`;
  const e = await one(
    `INSERT INTO employers (name, company_name, company_email, email_verified, country_code, phone_number, password, agreed_to_terms,
       website_url, company_size, country, city, state, billing_pincode, primary_contact_name, primary_contact_role, setup_completed, onboarding_completed, is_active, terms_accepted_version, terms_accepted_at)
     VALUES ($1,$2,$3,true,'+91',$4,$5,true,'https://example.com','11-50','India','Pune','Maharashtra','411001',$1,'Founder',true,true,$6,$7,now()) RETURNING id`,
    [name, companyName, email, nextPhone(), await hash(password, ARGON), active, TERMS_VERSION],
  );
  return { id: e.id, email, password, name, companyName, role: "employer" };
}

export async function seedProject(employerId, { name = null, skills = ["React", "SQL"], status = "active", description = null } = {}) {
  const r = await one(
    `INSERT INTO projects (employer_id, project_name, skills, scope_of_work, full_time_offer, location_type, preferred_locations, city, state, timezone, status, description)
     VALUES ($1,$2,$3,'short-term',false,'remote','[]','Pune','Maharashtra','Asia/Kolkata',$4,$5) RETURNING id`,
    [employerId, name ?? `Data Role ${uniq("p")}`, JSON.stringify(skills), status, description],
  );
  return r.id;
}

/** A proposal row (offer details shaped like src/lib/offer.ts expects). hired → counts as a paid hire. */
export async function seedProposal({ employerId, internId, projectId, status = "sent", roleTitle = "Data Intern" }) {
  const hired = status === "hired";
  const offer = {
    jd: "<p>Own a small slice of the product.</p>", mode: "remote", laptop: "candidate", shiftTo: "18:00", currency: "INR",
    duration: "3m", location: "Remote", timezone: "Asia/Kolkata", roleTitle, shiftFrom: "09:00", startDate: dateOnly(14),
    totalPrice: 24000, hourlyRate: 150, monthlyHours: 176, monthlyAmount: 26400, weeklySchedule: "mon_fri",
    workFromHomeDays: 0, paidLeavesPerMonth: 1, workFromOfficeDays: 0,
  };
  const r = await one(
    `INSERT INTO proposals (employer_id, intern_id, project_id, flow_type, status, currency, offer_details, ai_ratings, skills, hired_at)
     VALUES ($1,$2,$3,'direct',$4,'INR',$5,'{"coding":7,"overall":8,"aptitude":8,"communication":8}','["React","SQL"]',$6) RETURNING id`,
    [employerId, internId, projectId, status, JSON.stringify(offer), hired ? iso(-1) : null],
  );
  return r.id;
}

export async function seedAdmin({ password = PASSWORD } = {}) {
  const email = `${uniq("admin")}@e2e-staff.test`;
  const a = await one(`INSERT INTO admins (email, password, name, role) VALUES ($1,$2,'E2E Admin','super_admin') RETURNING id`, [email, await hash(password, ARGON)]);
  return { id: a.id, email, password, role: "admin" };
}

/** A fully paid, active partner college with a TPO login, through the real admin routes. Returns ids and the shared code. */
export async function seedCollege(adminCtx, { name, seats = 300, withTpo = true } = {}) {
  const college = await sendOk(adminCtx, "POST", "/api/admin/colleges", { name: name ?? `E2E Institute ${RUN.toUpperCase()}${++n}`, city: "Pune", state: "Maharashtra", isPartner: true }, [201]);
  const collegeId = college.id;
  await sendOk(adminCtx, "POST", `/api/admin/colleges/${collegeId}/seat-batches`, { seats }, [200]);
  const batch = await one(`SELECT id FROM college_seat_batches WHERE college_id = $1 AND status = 'pending'`, [collegeId]);
  await sendOk(adminCtx, "PATCH", `/api/admin/colleges/${collegeId}/seat-batches/${batch.id}`, { action: "paid", method: "bank", referenceId: uniq("UTR") }, [200]);
  const promo = await one(`SELECT id, code, max_usages, used_count FROM promo_codes WHERE college_id = $1`, [collegeId]);
  let tpo = null;
  if (withTpo) {
    const email = `${uniq("tpo")}@e2e-college.test`;
    const made = await sendOk(adminCtx, "POST", `/api/admin/colleges/${collegeId}/admins`, { name: "E2E Placement Officer", email }, [201]);
    tpo = { email, password: made.password, role: "college" };
  }
  return { collegeId, batchId: batch.id, code: promo?.code, promoId: promo?.id, tpo };
}

/* ── Sessions ───────────────────────────────────────────────────────────── */

/** A fresh browser context signed in as `who` ({ role, email, password }) through the real login route. */
export async function signedInContext(browser, who, options = {}) {
  const ctx = await browser.newContext({ baseURL: baseUrl(), viewport: { width: 1280, height: 900 }, ...options });
  ctx.setDefaultTimeout(20_000);
  const spec = LOGIN[who.role];
  const res = await ctx.request.post(new URL(spec.api, baseUrl()).toString(), {
    data: spec.body(who),
    headers: { "x-forwarded-for": nextIp(), "content-type": "application/json", origin: baseUrl() },
  });
  if (!res.ok()) {
    const detail = `login ${who.role} ${who.email} → HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`;
    await ctx.close();
    throw new Error(detail);
  }
  return ctx;
}

/** A signed-out context (for "does not exist for strangers" checks). */
export async function guestContext(browser, options = {}) {
  const ctx = await browser.newContext({ baseURL: baseUrl(), viewport: { width: 1280, height: 900 }, ...options });
  ctx.setDefaultTimeout(20_000);
  return ctx;
}

/**
 * JSON request with the session cookie and the double-submit CSRF header, as
 * csrfFetch sends it. Never throws on an HTTP error: returns { status, body }.
 */
export async function send(ctx, method, path, data, extraHeaders = {}) {
  const csrf = (await ctx.cookies(baseUrl())).find((c) => c.name === "ft_csrf")?.value;
  const headers = {
    origin: baseUrl(),
    ...(method !== "GET" && data !== undefined ? { "content-type": "application/json" } : {}),
    ...(csrf && method !== "GET" ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
    ...extraHeaders,
  };
  const res = await ctx.request.fetch(new URL(path, baseUrl()).toString(), {
    method,
    headers,
    data: data === undefined ? undefined : JSON.stringify(data),
    failOnStatusCode: false,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 500);
  }
  return { status: res.status(), body };
}

/** send(), but throws with route, status and body unless the status is one of `ok`. */
export async function sendOk(ctx, method, path, data, ok = [200, 201]) {
  const r = await send(ctx, method, path, data);
  if (!ok.includes(r.status)) throw new Error(`${method} ${path} → HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 600)}`);
  return r.body;
}

/** Poll `fn` until it returns a truthy value (or throw with `label`). */
export async function eventually(label, fn, { timeoutMs = 10_000, everyMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for: ${label}${last instanceof Error ? ` (${last.message})` : ""}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

export { closeDb } from "./db.mjs";
export { one, rows, db };

/**
 * Page-text assertions that never print the page: node's assert.match dumps
 * the whole 80 kB HTML into the failure report.
 */
export function expectText(text, re, message) {
  if (!re.test(text)) throw new Error(`${message ?? "expected text missing"}: ${re} not found (${text.length} chars)`);
}
export function expectNoText(text, re, message) {
  const m = re.exec(text);
  if (m) throw new Error(`${message ?? "unexpected text present"}: ${re} matched "${m[0].slice(0, 60)}"`);
}
