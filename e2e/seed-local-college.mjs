#!/usr/bin/env node
/**
 * One consistent local test world for the college portal: 500 JK Lakshmipat University students spread over every
 * stage (profile not started → AI interview → Findtern's check → in the pool → interview → offer → hired → completed),
 * 4 employers, 4 campus drives (live internship, live full-time, upcoming, past), seats and the TPO code.
 * Every screen reads the same rows, so the student, the employer, the admin and the college see the same story.
 *
 *   DATABASE_URL=postgresql://…@127.0.0.1:5435/<db> node e2e/seed-local-college.mjs          # dry run, rolled back
 *   DATABASE_URL=postgresql://…@127.0.0.1:5435/<db> node e2e/seed-local-college.mjs --yes    # wipe and seed
 *
 * LOCAL ONLY: refuses any host that is not 127.0.0.1 / localhost. It empties accounts, activity and payments (rows
 * only; the schema, migration record, colleges, plans, settings, terms and website_* content stay), then seeds. One
 * transaction. Deterministic: the same students, stages and numbers on every run (times move with "now").
 *
 * Logins (password Findtern@2026 for all):
 *   admin      admin@findtern.dev
 *   college    tpo@jklu.edu.in
 *   employers  hiring@northwind.dev, talent@meridian.dev, jobs@orchidfin.dev, people@kestrel.dev
 *   students   <first>.<last><n>@jklu.edu.in (any row of the TPO's Students list), e.g. the first: see the summary line
 * No real payment, no e-mail: payments are plain rows marked paid.
 */
import { createHash, randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import pg from "pg";

import { lineCharge } from "../src/lib/checkout.ts";
import { parseOffer } from "../src/lib/offer.ts";
import { draftFromRecord, emptyDraft, validateProfile } from "../src/lib/onboarding.ts";

const PASSWORD = "Findtern@2026";
const TERMS_VERSION = "2026-11-06"; // CURRENT_TERMS_VERSION in src/lib/terms.ts
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const FEE_MINOR = 249900;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();
const at = (ms) => new Date(NOW + ms).toISOString();
const iso = (d) => at(d * DAY);
const dateOnly = (d) => iso(d).slice(0, 10);
const pad = (n, w = 2) => String(n).padStart(w, "0");
const COMMIT = process.argv.includes("--yes");
const KEEP_TABLES = [
  "_ft_migrations", "platform_settings", "admin_roles",
  "colleges", "pricing_plans", "invoice_counters",
  "employer_terms", "intern_terms", "intern_non_disclosure_clauses",
];
const TOTAL = 500;

/* ── Deterministic randomness ───────────────────────────────────────────── */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2027);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const r1 = (v) => Math.round(v * 10) / 10;

/* ── Fixed lists ────────────────────────────────────────────────────────── */
const FIRST = ["Aarav", "Diya", "Ishaan", "Tanvi", "Vikram", "Sneha", "Aditya", "Pooja", "Siddharth", "Ananya", "Rishi", "Kavya", "Varun", "Rhea", "Arnav", "Tara", "Kabir", "Meera", "Karan", "Ishita", "Nikhil", "Prerna", "Dhruv", "Isha", "Aryan", "Aishwarya", "Dev", "Neha", "Samarth", "Shruti", "Tushar", "Pallavi", "Gaurav", "Simran", "Rahul", "Nandini", "Harsh", "Avani", "Manish", "Bhavna", "Akash", "Swati", "Yash", "Divya", "Pranav", "Sanjana", "Reyansh", "Saanvi", "Myra", "Rudra"];
const LAST = ["Sharma", "Agarwal", "Jain", "Meena", "Rathore", "Choudhary", "Gupta", "Saini", "Shekhawat", "Mathur", "Verma", "Khandelwal", "Patel", "Iyer", "Reddy", "Nair", "Kulkarni", "Joshi", "Mehta", "Bansal", "Kapoor", "Mishra", "Pandey", "Saxena", "Bhatia"];
const BRANCHES = ["CSE", "CSE", "CSE", "ECE", "ME", "AI & DS", "BBA"];
const DOMAINS = [
  ["Frontend", ["React", "TypeScript", "Tailwind CSS", "Next.js"]],
  ["Backend", ["Node.js", "PostgreSQL", "REST APIs", "Docker"]],
  ["Full Stack", ["React", "Node.js", "PostgreSQL", "GraphQL"]],
  ["UI/UX Design", ["Figma", "Design Systems", "User Research", "Prototyping"]],
  ["Data & ML", ["Python", "SQL", "Pandas", "Scikit-Learn"]],
  ["Marketing", ["Excel", "Market Research", "Content Writing", "Canva"]],
];
const EMPLOYERS = [
  { email: "hiring@northwind.dev", company: "Northwind Labs", contact: "Arjun Mehta", city: "Bengaluru", state: "Karnataka", pin: "560001" },
  { email: "talent@meridian.dev", company: "Meridian Labs", contact: "Nisha Rao", city: "Pune", state: "Maharashtra", pin: "411001" },
  { email: "jobs@orchidfin.dev", company: "Orchid Fintech", contact: "Rohit Shah", city: "Mumbai", state: "Maharashtra", pin: "400001" },
  { email: "people@kestrel.dev", company: "Kestrel Studio", contact: "Ira Sen", city: "Jaipur", state: "Rajasthan", pin: "302001" },
];

/**
 * Stages, with how many of the 500 land in each. Pre-pool stages are the TPO's "hidden profiles" reasons;
 * the rest are in the employer pool and somewhere on the hiring path.
 */
const STAGES = [
  ["not_started", 30],        // account + membership, no profile yet
  ["profile_incomplete", 30], // took the AI interview, profile left unfinished (no languages, no proofs)
  ["interview_pending", 50],  // submitted and paid, AI interview not taken
  ["checks_pending", 35],     // interviewed, waiting for Findtern's check
  ["rejected", 15],           // Findtern rejected the profile
  ["otw_off", 25],            // approved, Open to work turned off
  ["paused", 10],             // approved, profile paused (hidden)
  ["live", 120],              // approved, in the pool, nothing yet
  ["interview_scheduled", 25],
  ["interview_done", 20],
  ["proposal_sent", 35],      // offer waiting on the student
  ["proposal_accepted", 15],  // accepted, employer yet to pay
  ["hired_recent", 20],       // hired in the live drive, starts soon
  ["hired_active", 30],       // working, timesheets running
  ["completed", 20],
  ["ft_offer_sent", 10],      // final-year: full-time offer from the full-time drive (1% fee)
  ["ft_hired", 10],           // final-year: full-time offer accepted and paid
];
const PRE_POOL = new Set(["not_started", "profile_incomplete", "interview_pending", "checks_pending", "rejected"]);
const FINAL_YEAR_ONLY = new Set(["ft_offer_sent", "ft_hired"]);

function plan() {
  const stages = STAGES.flatMap(([s, n]) => Array(n).fill(s));
  if (stages.length !== TOTAL) throw new Error(`stage plan adds up to ${stages.length}, not ${TOTAL}`);
  // Years: 10% first year, then 30% each; full-time stages are 4th year.
  const out = [];
  const shuffled = stages.map((s) => ({ s, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.s);
  shuffled.forEach((stage, i) => {
    let year = FINAL_YEAR_ONLY.has(stage) ? 4 : (() => { const r = rand(); return r < 0.1 ? 1 : r < 0.4 ? 2 : r < 0.7 ? 3 : 4; })();
    const semester = year * 2 - (rand() < 0.5 ? 1 : 0);
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length];
    const branch = FINAL_YEAR_ONLY.has(stage) ? "CSE" : pick(BRANCHES);
    const ratings = { communication: r1(between(4, 9.8)), coding: r1(between(3.5, 9.9)), aptitude: r1(between(4, 9.8)), interview: r1(between(4, 9.8)) };
    let score = r1((ratings.communication + ratings.coding + ratings.aptitude + ratings.interview) / 4);
    if (stage === "rejected") score = r1(between(3, 4.4));
    out.push({
      n: i + 1, stage, year, semester, branch, first, last, ratings, score,
      cgpa: r1(between(5.6, 9.8)),
      domain: DOMAINS[i % DOMAINS.length],
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@jklu.edu.in`,
      rollNo: `${2026 - year}JK${pad(i + 1, 4)}`,
      phone: `98290${pad(i + 1, 5)}`,
    });
  });
  return out;
}

/* ── Offer and timesheet helpers (same shapes as e2e/seed-demo-interns.mjs) ── */
const internOffer = (title, startOffset, duration = "3m") => ({
  jd: "<p>Own a small slice of the product. Weekly demos.</p>", mode: "remote", laptop: "candidate", shiftTo: "18:00", currency: "INR",
  duration, location: "Remote", timezone: "Asia/Kolkata", roleTitle: title, shiftFrom: "09:00",
  startDate: dateOnly(startOffset), totalPrice: 24000, hourlyRate: 150, monthlyHours: 176,
  monthlyAmount: 26400, weeklySchedule: "mon_fri", workFromHomeDays: 0, paidLeavesPerMonth: 1, workFromOfficeDays: 0,
});
const fullTimeOffer = (title, driveId, ctc, startOffset, letterUrl) => ({
  currency: "INR",
  fullTimeOffer: {
    driveId, feeRate: 0.01, jobTitle: title, jobMode: "hybrid", jobLocationCity: "Jaipur", jobLocationState: "Rajasthan",
    timezone: "Asia/Kolkata", shiftFrom: "09:30", shiftTo: "18:30", ctcCurrency: "INR", annualCtc: ctc,
    offerLetterKey: "seed-offer-letter", offerLetterUrl: letterUrl, startDate: dateOnly(startOffset), createdAt: at(-30 * HOUR),
  },
});
function addDaysIso(isoDate, n) { const d = new Date(isoDate + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function addMonthsIso(isoDate, n) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  t.setUTCDate(Math.min(d, new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()));
  return t.toISOString().slice(0, 10);
}
const offsetOf = (isoDate) => Math.round((Date.parse(isoDate + "T00:00:00Z") - Date.parse(dateOnly(0) + "T00:00:00Z")) / DAY);
const bandOf = (score) => (score >= 8 ? "assured" : score >= 6 ? "skilled" : "standard");
const INCENTIVE_MINOR = { standard: 50000, skilled: 100000, assured: 150000 }; // src/lib/college/wallet.ts

/* ── Main ───────────────────────────────────────────────────────────────── */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL to the local test database.");
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`Refusing: ${host} is not this machine. Local test databases only.`);
  const client = new pg.Client({ connectionString: url, options: "-c TimeZone=UTC" });
  await client.connect();
  const q = (sql, params = []) => client.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  console.log(`[seed-local] ${host}/${new URL(url).pathname.slice(1)}  mode: ${COMMIT ? "WRITE (--yes)" : "dry run (rolled back)"}`);

  await q("BEGIN");
  try {
    // 0. Empty accounts, activity and payments (rows only).
    const tables = (
      await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> ALL($1) AND table_name NOT LIKE 'website\\_%' AND table_name NOT LIKE '\\_\\_drizzle%' ORDER BY 1`, [KEEP_TABLES])
    ).rows.map((r) => r.table_name);
    await q(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY`);
    console.log(`[seed-local] emptied ${tables.length} tables`);

    const college = await one(`SELECT id, name, code FROM colleges WHERE slug = 'jklu'`);
    if (!college) throw new Error("JKLU (slug jklu) is not in colleges: run npm run db:seed-colleges once first.");
    await q(`UPDATE colleges SET is_partner = true, is_active = true, email_domains = '["jklu.edu.in"]'::jsonb, state = 'Rajasthan',
               bank_account_name = 'JK Lakshmipat University', bank_name = 'HDFC Bank', bank_account_number = '000123456789', bank_ifsc = 'HDFC0000001' WHERE id = $1`, [college.id]);

    const pw = await hash(PASSWORD, ARGON);

    // 1. Admin, placement officer.
    await q(`INSERT INTO admins (email, password, name, role) VALUES ('admin@findtern.dev',$1,'Priya Raghavan','super_admin')`, [pw]);
    const tpo = await one(
      `INSERT INTO college_admins (college_id, name, email, password, is_active, terms_accepted_version, terms_accepted_at) VALUES ($1,'Bhavesh Sharma','tpo@jklu.edu.in',$2,true,$3,now()) RETURNING id`,
      [college.id, pw, TERMS_VERSION],
    );

    // 2. Employers, two open projects each.
    const employers = [];
    for (const [k, e] of EMPLOYERS.entries()) {
      const row = await one(
        `INSERT INTO employers (name, company_name, company_email, email_verified, country_code, phone_number, password, agreed_to_terms,
           website_url, company_size, country, city, state, billing_pincode, primary_contact_name, primary_contact_role,
           setup_completed, onboarding_completed, is_active, terms_accepted_version, terms_accepted_at)
         VALUES ($1,$2,$3,true,'+91',$4,$5,true,'https://example.com','11-50','India',$6,$7,$8,$1,'Hiring Manager',true,true,true,$9,now()) RETURNING id`,
        [e.contact, e.company, e.email, `62000000${pad(k + 1)}`, pw, e.city, e.state, e.pin, TERMS_VERSION],
      );
      const projects = [];
      for (let p = 0; p < 2; p++) {
        const [domain, skills] = DOMAINS[(k * 2 + p) % DOMAINS.length];
        const pr = await one(
          `INSERT INTO projects (employer_id, project_name, skills, scope_of_work, full_time_offer, location_type, preferred_locations, city, state, timezone, status)
           VALUES ($1,$2,$3,'medium-term',$4,'remote','[]',$5,$6,'Asia/Kolkata','active') RETURNING id`,
          [row.id, `${domain} Intern`, JSON.stringify(skills.slice(0, 3)), p === 0, e.city, e.state],
        );
        projects.push({ id: pr.id, title: `${domain} Intern` });
      }
      employers.push({ id: row.id, ...e, projects });
    }

    // 3. Seats and the TPO code: 600 seats paid, 100 more ordered and unpaid.
    const tpoCode = `JKLU${randomBytes(3).toString("hex").toUpperCase()}`;
    const promo = await one(
      `INSERT INTO promo_codes (code, description, discount_type, discount_value, applies_to, college_id, used_count, max_usages, is_active)
       VALUES ($1,'College TPO code','percentage',100,'intern',$2,0,600,true) RETURNING id`,
      [tpoCode, college.id],
    );
    const seatPrice = 80000; // ₹800 a seat before GST
    await q(`INSERT INTO college_seat_batches (college_id, seats, unit_price_minor, amount_minor, status, method, reference_id, invoice_number, paid_at, created_by)
             VALUES ($1,600,$2,$3,'paid','bank','UTR-SEED-001','SEED-001',$4,$5)`, [college.id, seatPrice, Math.round(600 * seatPrice * 1.18), iso(-40), tpo.id]);
    await q(`INSERT INTO college_seat_batches (college_id, seats, unit_price_minor, amount_minor, status, created_by) VALUES ($1,100,$2,$3,'pending',$4)`,
      [college.id, seatPrice, Math.round(100 * seatPrice * 1.18), tpo.id]);

    // 4. Drives. Windows: live internship (started 2 days ago), live full-time (started 1 day ago), upcoming, past.
    const token = () => createHash("sha256").update(randomBytes(32)).digest("hex");
    const drive = async (title, kind, start, end, eligibility, invited) =>
      one(
        `INSERT INTO college_drives (college_id, title, kind, description, starts_at, ends_at, eligibility, token_hash, created_by, invited_employers, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, starts_at, ends_at`,
        [college.id, title, kind, kind === "full_time" ? "Full-time roles for final-year students." : "Summer internships, interviews live inside the drive.",
         start, end, JSON.stringify(eligibility), token(), tpo.id, JSON.stringify(invited), new Date(Date.parse(start) - 3 * DAY).toISOString()],
      );
    const invite = (list) => list.map((e) => ({ company: e.company, email: e.email }));
    const liveIntern = await drive("Summer internship drive 2027", "internship", at(-2 * DAY), at(5 * DAY), { years: [2, 3] },
      [...invite(employers), { company: "Zephyr Robotics", email: "hr@zephyr.dev" }]);
    const liveFullTime = await drive("Final year placements 2027", "full_time", at(-1 * DAY), at(6 * DAY), { years: [4], minCgpa: 6 },
      [...invite(employers.slice(0, 2)), { company: "Atlas Consulting", email: "campus@atlas.dev" }]);
    await drive("Winter internship drive", "internship", at(4 * DAY), at(9 * DAY), { years: [2, 3] }, invite(employers.slice(1, 3)));
    const past = await drive("Monsoon internship drive", "internship", at(-60 * DAY), at(-53 * DAY), { years: [2, 3, 4] }, invite(employers.slice(0, 3)));
    // Who came: all four to the live internship drive, two to full-time, three to the past one.
    const joins = [
      ...employers.map((e, k) => [liveIntern.id, e.id, at(-2 * DAY + (k + 1) * 2.5 * HOUR)]),
      [liveFullTime.id, employers[0].id, at(-1 * DAY + 1.5 * HOUR)], [liveFullTime.id, employers[1].id, at(-1 * DAY + 6 * HOUR)],
      ...employers.slice(0, 3).map((e, k) => [past.id, e.id, at(-60 * DAY + (k + 1) * 4 * HOUR)]),
    ];
    for (const [d, e, t] of joins) await q(`INSERT INTO college_drive_employers (drive_id, employer_id, joined_at) VALUES ($1,$2,$3)`, [d, e, t]);

    // 5. Roster: every student, plus 40 who are on the college's list but have not joined Findtern.
    const students = plan();
    for (let i = 0; i < 40; i++) {
      await q(`INSERT INTO college_roster (college_id, email, name, roll_no, year, branch, phone) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [college.id, `notjoined${i + 1}@jklu.edu.in`, `${FIRST[(i * 3) % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`, `${2026 - (2 + (i % 3))}JK9${pad(i + 1, 3)}`, 2 + (i % 3), pick(BRANCHES), `98291${pad(i + 1, 5)}`]);
    }

    // 6. Students and everything hanging off their stage.
    const counts = {};
    let paidSeats = 0;
    let wallet = 0;
    let k = 0; // round-robin over employers for hiring stages
    for (const s of students) {
      counts[s.stage] = (counts[s.stage] ?? 0) + 1;
      const [domain, skills] = s.domain;
      const visibility = s.stage === "paused" ? "hidden" : "live";
      const u = await one(
        `INSERT INTO users (first_name, last_name, email, email_verified, is_active, country_code, phone_number, password, agreed_to_terms, role, profile_visibility, terms_accepted_version, terms_accepted_at, created_at)
         VALUES ($1,$2,$3,true,true,'+91',$4,$5,true,'intern',$6,$7,now(),$8) RETURNING id`,
        [s.first, s.last, s.email, s.phone, pw, visibility, TERMS_VERSION, iso(-70 + (s.n % 40))],
      );
      s.id = u.id;
      await q(`INSERT INTO college_roster (college_id, email, name, roll_no, year, branch, phone) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [college.id, s.email, `${s.first} ${s.last}`, s.rollNo, s.year, s.branch, s.phone]);
      await q(`INSERT INTO college_memberships (user_id, college_id, status, verified_by, year, branch, joined_at) VALUES ($1,$2,'verified','email_domain',$3,$4,$5)`,
        [u.id, college.id, s.year, s.branch, iso(-60 + (s.n % 50))]);
      // Online now for most; the rest went quiet at different times.
      const seen = s.n % 4 === 0 ? at(-(20 + (s.n % 300)) * 60_000) : at(-((s.n % 50) + 5) * 1000);
      await q(`INSERT INTO college_presence (user_id, college_id, last_seen_at) VALUES ($1,$2,$3)`, [u.id, college.id, seen]);

      if (s.stage === "not_started") continue;

      const submitted = s.stage !== "profile_incomplete";
      const interviewed = s.stage !== "interview_pending";
      const paid = true; // the TPO code activated their account
      // An unfinished profile cannot be approved: it waits, like a profile in Findtern's check.
      const approval = s.stage === "checks_pending" || s.stage === "profile_incomplete" ? "Pending" : s.stage === "rejected" ? "Rejected" : interviewed && submitted ? "Approved" : undefined;
      const extra = {
        ...(paid ? { payment: { isPaid: true, paidAt: iso(-30 + (s.n % 20)), gateway: "free", orderId: `free_${tpoCode}_${pad(s.n, 3)}`, paymentId: null, promoCode: tpoCode, finalAmountMinor: 0, discountAmountMinor: FEE_MINOR, originalAmountMinor: FEE_MINOR } } : {}),
        ...(interviewed ? { ratings: s.ratings, findternScore: s.score, aiFeedbackLink: "https://example.org/incruiter/report-demo.pdf", aiRecordingLink: "https://example.org/incruiter/recording-demo.mp4" } : {}),
        ...(approval ? { approvalStatus: approval } : {}),
        ...(approval && approval !== "Pending" ? { approvedAt: iso(-20 + (s.n % 10)), approvedBy: "seed-local" } : {}),
        academics: {
          level: "bachelors", score: s.cgpa.toFixed(1), degree: s.branch === "BBA" ? "BBA" : "B.Tech", status: "Pursuing",
          startYear: String(2027 - s.year), endYear: String(2031 - s.year), currentSemester: String(s.semester), scoreType: "cgpa",
          institution: college.name, certifications: [], specialization: s.branch, marksheetUploads: [], professionalCourses: [],
          // A photo per finished semester and the college ID (src/lib/cgpa-verification.ts proofSlots), each its own file.
          ...(submitted
            ? { semesterProofUploads: Object.fromEntries([...Array.from({ length: s.semester - 1 }, (_, j) => `marksheet-${j + 1}`), "college-id"].map((key) => [key, { name: `seed-${pad(s.n, 3)}-${key}.png`, type: "image/png", size: 1200 }])) }
            : {}),
        },
        // Findtern's CGPA check: done for approved students, open while the profile waits for the check.
        ...(approval === "Approved" ? { cgpaVerification: { status: "verified", claimedScore: s.cgpa.toFixed(1), scoreType: "cgpa", semester: s.semester, requestedAt: iso(-30), decidedAt: iso(-25), decidedBy: "seed-local" } } : {}),
        ...(approval === "Pending" ? { cgpaVerification: { status: "pending", claimedScore: s.cgpa.toFixed(1), scoreType: "cgpa", semester: s.semester, requestedAt: iso(-2) } } : {}),
        ...(submitted
          ? {
              languages: [
                { id: "lang-en", language: "english", level: "professional", read: "yes", write: "yes", speak: "yes" },
                { id: "lang-hi", language: "hindi", level: "native", read: "yes", write: "yes", speak: "yes" },
              ],
              extracurricular: [{ id: "act-1", activity: ["Chess", "Cricket", "Debate", "Photography", "Robotics club"][s.n % 5], level: "Intermediate" }],
              emergencyPhone: `71000${pad(s.n, 5)}`, emergencyCountryCode: "+91", secondPocPhone: null, secondPocCountryCode: "+91",
              bankDetails: { bankName: "Seed Bank", ifscCode: "SEED0000001", accountNumber: `20000${pad(s.n, 6)}`, accountHolderName: `${s.first} ${s.last}`, upiId: null },
              ndaAcceptedAt: iso(-35), profileSubmittedAt: iso(-35 + (s.n % 10)),
            }
          : {}),
        openToWork: s.stage !== "otw_off",
      };
      await q(
        `INSERT INTO intern_onboarding (user_id, pin_code, state, city, aadhaar_number, pan_number, bio, experience_json, skills, location_types, preferred_locations, has_laptop, preview_summary, extra_data)
         VALUES ($1,'302026','Rajasthan','Jaipur',$2,$3,$4,'[]',$5,$6,$7,true,$8,$9)`,
        [u.id, submitted ? `8880${pad(s.n, 8)}` : null, submitted ? `JKLUP${pad(s.n, 4)}Z` : null,
         `Year ${s.year} ${s.branch} student at ${college.name}. Builds small ${domain.toLowerCase()} projects in ${skills.slice(0, 3).join(", ")}.`,
         JSON.stringify(skills), JSON.stringify(s.n % 2 ? ["remote", "hybrid"] : ["onsite", "hybrid"]), JSON.stringify(["Jaipur", "Delhi"]),
         `${college.name}, ${s.branch}, year ${s.year}.${interviewed ? ` Score ${s.score.toFixed(1)}/10.` : ""}`, JSON.stringify(extra)],
      );
      if (submitted) {
        await q(`INSERT INTO intern_document (user_id, profile_photo_name, profile_photo_type, profile_photo_size, pan_image_name, pan_image_type, pan_image_size)
                 VALUES ($1,'seed-photo.png','image/png',1200,'seed-pan.png','image/png',1200)`, [u.id]);
      }
      if (paid) {
        paidSeats++;
        await q(`INSERT INTO intern_payments (intern_id, gateway, order_id, payment_id, amount_minor, currency, status, paid_at, raw)
                 VALUES ($1,'free',$2,NULL,0,'INR','paid',$3,$4)`,
          [u.id, extra.payment.orderId, extra.payment.paidAt, JSON.stringify({ promo: { promoCode: tpoCode, discountMinor: FEE_MINOR } })]);
        await q(`INSERT INTO promo_code_usages (promo_code_id, user_id, order_id, discount_applied_minor, created_at) VALUES ($1,$2,$3,$4,$5)`,
          [promo.id, u.id, extra.payment.orderId, FEE_MINOR, extra.payment.paidAt]);
      }
      if (PRE_POOL.has(s.stage) || ["otw_off", "paused", "live"].includes(s.stage)) continue;

      // Hiring path. Students a live drive can see get its employers and times, so the drive board counts them.
      const inLiveIntern = (s.year === 2 || s.year === 3);
      const emp = employers[k++ % employers.length];
      const proj = emp.projects[s.n % 2];
      const aiRatings = JSON.stringify({ coding: s.ratings.coding, overall: s.score, aptitude: s.ratings.aptitude, communication: s.ratings.communication });
      const insertProposal = (status, offer, created, hiredAt = null, projectId = proj.id, employerId = emp.id) =>
        one(
          `INSERT INTO proposals (employer_id, intern_id, project_id, flow_type, status, currency, offer_details, ai_ratings, skills, hired_at, created_at, updated_at)
           VALUES ($1,$2,$3,'direct',$4,'INR',$5,$6,$7,$8,$9,$9) RETURNING id`,
          [employerId, u.id, projectId, status, JSON.stringify(offer), aiRatings, JSON.stringify(skills.slice(0, 2)), hiredAt, created],
        );
      // Inside the live internship drive window (it opened 2 days ago) for drive students; earlier for the rest.
      const recent = (h) => (inLiveIntern ? at(-h * HOUR) : iso(-6 - (s.n % 8)));
      // Paid upfront, the amount checkout charges for this offer (src/lib/checkout.ts), linked by the order notes.
      const employerPaid = (whenDays, proposalId, offer) => {
        const amount = lineCharge(parseOffer(offer, "INR"), s.score, "upfront").totalMinor;
        return q(`INSERT INTO employer_payments (employer_id, gateway, order_id, payment_id, amount_minor, currency, status, paid_at, raw)
           VALUES ($1,'razorpay',$2,$3,$4,'INR','paid',$5,$6)`,
          [emp.id, `seed_eorder_${proposalId}`, `seed_epay_${proposalId}`, amount, iso(whenDays),
           JSON.stringify({ id: `seed_eorder_${proposalId}`, amount, currency: "INR", notes: { proposalIds: [proposalId], paymentMode: "upfront" } })]);
      };
      const timesheet = async (proposalId, status, joiningOffset, period) => {
        const start = addMonthsIso(dateOnly(joiningOffset), period);
        const end = addDaysIso(addMonthsIso(dateOnly(joiningOffset), period + 1), -1);
        const entries = [];
        for (let d = start; d <= end; d = addDaysIso(d, 1)) {
          const dow = new Date(d + "T00:00:00Z").getUTCDay();
          const off = dow === 0 || dow === 6;
          const present = !off && status !== "draft" && d <= dateOnly(0);
          entries.push({ date: d, hours: present ? 8 : 0, note: "", status: off ? "Fixed off" : present ? "Present" : "" });
        }
        const after = offsetOf(end) + 1;
        await q(`INSERT INTO timesheets (proposal_id, employer_id, intern_id, period_start, period_end, status, entries, submitted_at, approved_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [proposalId, emp.id, u.id, start, end, status, JSON.stringify(entries), status === "draft" ? null : iso(after), status === "approved" ? iso(after + 1) : null]);
      };

      if (s.stage === "interview_scheduled" || s.stage === "interview_done") {
        const future = s.stage === "interview_scheduled";
        const base = future ? 1 + (s.n % 6) : -1 - (s.n % 10);
        await q(`INSERT INTO interviews (employer_id, intern_id, project_id, status, slot1, slot2, slot3, selected_slot, timezone, meeting_link, notes, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,1,'Asia/Kolkata',$8,$9,$10)`,
          [emp.id, u.id, proj.id, future ? "scheduled" : "completed", iso(base), iso(base + 1), iso(base + 2),
           future ? "https://meet.example.com/seed-room" : null, future ? null : "Clear communicator, solid fundamentals.", iso(base - 3)]);
      }
      if (s.stage === "proposal_sent") await insertProposal("sent", internOffer(proj.title, 10 + (s.n % 10)), recent(2 + (s.n % 40)));
      if (s.stage === "proposal_accepted") await insertProposal("accepted", internOffer(proj.title, 8 + (s.n % 10)), recent(10 + (s.n % 30)));
      if (s.stage === "hired_recent") {
        const offer = internOffer(proj.title, 4 + (s.n % 6));
        const p = await insertProposal("hired", offer, recent(30 + (s.n % 10)), recent(4 + (s.n % 20)));
        await employerPaid(inLiveIntern ? -0.2 : -4, p.id, offer);
      }
      if (s.stage === "hired_active") {
        const joined = -(12 + (s.n % 35));
        const offer = internOffer(proj.title, joined, "6m");
        const p = await insertProposal("hired", offer, iso(joined - 6), iso(joined - 3));
        await employerPaid(joined - 3, p.id, offer);
        await timesheet(p.id, joined <= -38 ? "approved" : joined <= -30 ? "submitted" : "draft", joined, 0);
        if (joined <= -38) await q(`INSERT INTO intern_payouts (intern_id, amount_minor, currency, status, method, reference_id, paid_at, created_at) VALUES ($1,2640000,'INR','paid','bank',$2,$3,$3)`, [u.id, `SEEDREF${pad(s.n, 3)}1`, iso(-5)]);
      }
      if (s.stage === "completed") {
        // Hired from the past drive (inside its window), finished since.
        const joined = -55 + 3;
        const created = at(-60 * DAY + 20 * HOUR + (s.n % 30) * HOUR);
        const offer = internOffer(proj.title, joined, "1m");
        const p = await insertProposal("completed", offer, created, at(-60 * DAY + 60 * HOUR));
        await employerPaid(joined - 2, p.id, offer);
        await timesheet(p.id, "approved", joined, 0);
        await q(`INSERT INTO intern_payouts (intern_id, amount_minor, currency, status, method, reference_id, paid_at, created_at) VALUES ($1,2640000,'INR','paid','bank',$2,$3,$3)`, [u.id, `SEEDREF${pad(s.n, 3)}C`, iso(-15)]);
        const band = bandOf(s.score);
        wallet += INCENTIVE_MINOR[band];
        await q(`INSERT INTO college_wallet_entries (college_id, kind, amount_minor, proposal_id, intern_id, band_id, created_at) VALUES ($1,'incentive',$2,$3,$4,$5,$6)`,
          [college.id, INCENTIVE_MINOR[band], p.id, u.id, band, iso(-14)]);
      }
      if (s.stage === "ft_offer_sent" || s.stage === "ft_hired") {
        // Full-time offers come from the two employers in the full-time drive, inside its window.
        const ftEmp = employers[s.n % 2];
        const ctc = 400000 + (s.n % 8) * 50000;
        const id = (await one(`SELECT gen_random_uuid() AS id`)).id;
        const offer = fullTimeOffer(`${ftEmp.projects[0].title.replace(" Intern", "")} Associate`, liveFullTime.id, ctc, 30 + (s.n % 20), `http://localhost/api/proposals/${id}/offer-letter`);
        const hired = s.stage === "ft_hired";
        await q(`INSERT INTO proposals (id, employer_id, intern_id, project_id, flow_type, status, currency, offer_details, ai_ratings, skills, hired_at, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,'direct',$5,'INR',$6,NULL,'[]',$7,$8,$8)`,
          [id, ftEmp.id, u.id, ftEmp.projects[0].id, hired ? "hired" : "sent", JSON.stringify(offer), hired ? at(-4 * HOUR) : null, at(-(6 + (s.n % 14)) * HOUR)]);
        if (hired) {
          // The 1% drive fee, as checkout charges it for this offer.
          const amount = lineCharge(parseOffer(offer, "INR"), s.score, "upfront").totalMinor;
          await q(`INSERT INTO employer_payments (employer_id, gateway, order_id, payment_id, amount_minor, currency, status, paid_at, raw) VALUES ($1,'razorpay',$2,$3,$4,'INR','paid',$5,$6)`,
            [ftEmp.id, `seed_eorder_${id}`, `seed_epay_${id}`, amount, at(-4 * HOUR), JSON.stringify({ id: `seed_eorder_${id}`, amount, currency: "INR", notes: { proposalIds: [id], paymentMode: "upfront" } })]);
        }
      }
    }
    await q(`UPDATE promo_codes SET used_count = $1 WHERE id = $2`, [paidSeats, promo.id]);

    // 7. Inside the live drives: shortlists, call requests (some waiting, some accepted, some declined).
    const pool = students.filter((s) => ["live", "interview_scheduled", "interview_done", "proposal_sent"].includes(s.stage));
    const drivePool = pool.filter((s) => s.year === 2 || s.year === 3);
    for (const [i, s] of drivePool.slice(0, 60).entries()) {
      const e = employers[i % employers.length];
      await q(`INSERT INTO college_drive_shortlist (drive_id, employer_id, user_id, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [liveIntern.id, e.id, s.id, at(-(i % 40) * HOUR)]);
      if (i % 3 !== 0) continue;
      const status = ["requested", "accepted", "declined", "requested", "accepted"][i % 5];
      const startsAt = status === "requested" ? at((5 + (i % 10)) * 60_000) : at(-(1 + (i % 30)) * HOUR);
      await q(`INSERT INTO college_drive_meetings (drive_id, employer_id, user_id, starts_at, status, meeting_link, responded_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [liveIntern.id, e.id, s.id, startsAt, status, status === "accepted" ? "https://meet.example.com/seed-call" : null, status === "requested" ? null : startsAt, at(-(1 + (i % 30)) * HOUR - 10 * 60_000)]);
    }
    const finalYears = students.filter((s) => s.year === 4 && ["live", "ft_offer_sent"].includes(s.stage)).slice(0, 15);
    for (const [i, s] of finalYears.entries()) {
      const e = employers[i % 2];
      await q(`INSERT INTO college_drive_shortlist (drive_id, employer_id, user_id, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [liveFullTime.id, e.id, s.id, at(-(i % 20) * HOUR)]);
      if (i % 2 === 0) {
        const status = i % 4 === 0 ? "requested" : "accepted";
        await q(`INSERT INTO college_drive_meetings (drive_id, employer_id, user_id, starts_at, status, meeting_link, responded_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [liveFullTime.id, e.id, s.id, status === "requested" ? at(10 * 60_000) : at(-(2 + i) * HOUR), status, status === "accepted" ? "https://meet.example.com/seed-call" : null, status === "requested" ? null : at(-(2 + i) * HOUR), at(-(3 + i) * HOUR)]);
      }
    }

    // 8. Self-check before keeping it.
    const n = async (sql, p = []) => (await one(sql, p)).n;
    const check = {
      students: await n(`SELECT count(*)::int n FROM college_memberships WHERE college_id = $1 AND status = 'verified'`, [college.id]),
      roster: await n(`SELECT count(*)::int n FROM college_roster WHERE college_id = $1`, [college.id]),
      distinctEmails: await n(`SELECT count(DISTINCT email)::int n FROM users`),
      proposals: await n(`SELECT count(*)::int n FROM proposals`),
      hired: await n(`SELECT count(*)::int n FROM proposals WHERE status IN ('hired','completed')`),
      fullTimeDriveOffers: await n(`SELECT count(*)::int n FROM proposals WHERE offer_details->'fullTimeOffer'->>'driveId' = $1`, [liveFullTime.id]),
      // Every hire is paid for; every proposal's intern and employer exist.
      unpaidHires: await n(`SELECT count(*)::int n FROM proposals p WHERE status IN ('hired','completed') AND NOT EXISTS (SELECT 1 FROM employer_payments e WHERE e.employer_id = p.employer_id AND e.raw->'notes'->'proposalIds' ? p.id)`),
      orphanProposals: await n(`SELECT count(*)::int n FROM proposals p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.intern_id) OR NOT EXISTS (SELECT 1 FROM employers e WHERE e.id = p.employer_id)`),
      offersToHiddenStudents: await n(`SELECT count(*)::int n FROM proposals p JOIN intern_onboarding o ON o.user_id = p.intern_id WHERE coalesce(o.extra_data->>'approvalStatus','') <> 'Approved'`),
    };
    // Every submitted profile passes the app's own profile form check, so "complete" means complete on every screen.
    const submittedRows = (await q(`SELECT * FROM intern_onboarding WHERE extra_data ? 'profileSubmittedAt'`)).rows;
    check.incompleteSubmitted = submittedRows.filter((r) => validateProfile(
      { ...emptyDraft(), ...draftFromRecord({ userId: r.user_id, pinCode: r.pin_code, state: r.state, city: r.city, aadhaarNumber: r.aadhaar_number, panNumber: r.pan_number, bio: r.bio, experienceJson: r.experience_json, skills: r.skills, locationTypes: r.location_types, preferredLocations: r.preferred_locations, hasLaptop: r.has_laptop, previewSummary: r.preview_summary, extraData: r.extra_data }) },
      { hasPhoto: true, hasPanImage: true, hasAadhaarImage: false },
    )).length;
    console.log("[seed-local] stages:", JSON.stringify(counts));
    console.log("[seed-local] check:", JSON.stringify(check));
    if (check.students !== TOTAL || check.roster !== TOTAL + 40 || check.distinctEmails !== TOTAL || check.unpaidHires || check.orphanProposals || check.offersToHiddenStudents || check.incompleteSubmitted) {
      throw new Error("Self-check failed (see the check line)");
    }
    console.log(`[seed-local] seats used ${paidSeats} of 600 · TPO code ${tpoCode} · college wallet ₹${wallet / 100} · first student login ${students[0].email}`);

    if (COMMIT) { await q("COMMIT"); console.log("[seed-local] committed."); }
    else { await q("ROLLBACK"); console.log("[seed-local] dry run: rolled back. Re-run with --yes to keep it."); }
  } catch (err) {
    await q("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("[seed-local] FAILED:", e.code ?? "", e.message); process.exit(1); });
