#!/usr/bin/env node
/**
 * Demo data: 50 interns who have paid the intern fee, spread across the whole
 * journey (pending approval → approved → interview → proposal → hired → completed),
 * each with a different name and a different Findtern score.
 *
 *   node e2e/seed-demo-interns.mjs            # dry run: does everything, then rolls back
 *   node e2e/seed-demo-interns.mjs --yes      # same, then commits
 *   add --reset to first empty accounts, activity and payments (rows only) in
 *   the same transaction, so a failed seed leaves the database as it was.
 *   Kept: the tables, the migration record, settings, roles, colleges, plans,
 *   promo codes, invoice counters, terms, NDA clauses and all website_* content.
 *
 * Target: the Neon STAGING database (read from ~/findtern-dumps/.neon.env, host
 * pinned in e2e/lib/staging.mjs), or a loopback database when
 * STAGING_LOCAL_DB_URL is set. The production server is refused there.
 *
 * Safe to re-run: it first removes the rows of its own earlier run, found by the
 * e-mail domain @seed.findtern.test (a .test address can never receive mail),
 * and touches nothing else. Everything is one transaction.
 *
 * Logins (all use the same password):
 *   admin     admin@seed.findtern.test
 *   employers employer1..4@seed.findtern.test
 *   interns   intern01..50@seed.findtern.test
 *   password  Seed#Demo2026
 *
 * No real payment, no e-mail: payments are plain rows marked paid.
 */
import { hash } from "@node-rs/argon2";
import pg from "pg";

import { sslFor, stagingDatabaseUrl } from "./lib/staging.mjs";

const DOMAIN = "seed.findtern.test";
const PASSWORD = "Seed#Demo2026";
// Mirrors CURRENT_TERMS_VERSION in src/lib/terms.ts so the terms pop-up never blocks a demo login.
const TERMS_VERSION = "2026-11-06";
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const FEE_MINOR = 249900;
const DAY = 86_400_000;
const iso = (d) => new Date(Date.now() + d * DAY).toISOString();
const dateOnly = (d) => iso(d).slice(0, 10);
const pad = (n) => String(n).padStart(2, "0");
const COMMIT = process.argv.includes("--yes");
const RESET = process.argv.includes("--reset");
/** --reset keeps configuration, reference data and site content (plus every website_* table): accounts, activity and payments go. */
const KEEP_TABLES = [
  "_ft_migrations", "platform_settings", "admin_roles",
  "colleges", "pricing_plans", "promo_codes", "invoice_counters",
  "employer_terms", "intern_terms", "intern_non_disclosure_clauses",
];

/* ── Fixed lists: names, scores, places ─────────────────────────────────── */

const FIRST = [
  "Aarav", "Diya", "Ishaan", "Tanvi", "Vikram", "Sneha", "Aditya", "Pooja", "Siddharth", "Ananya",
  "Rishi", "Kavya", "Varun", "Rhea", "Arnav", "Tara", "Kabir", "Meera", "Karan", "Ishita",
  "Nikhil", "Prerna", "Dhruv", "Isha", "Aryan", "Aishwarya", "Dev", "Neha", "Samarth", "Shruti",
  "Tushar", "Pallavi", "Gaurav", "Simran", "Rahul", "Nandini", "Harsh", "Avani", "Manish", "Bhavna",
  "Akash", "Swati", "Suresh", "Divya", "Deepak", "Anushka", "Pranav", "Sanjana", "Yash", "Ritu",
];
const LAST = [
  "Sharma", "Patel", "Iyer", "Reddy", "Nair", "Kulkarni", "Verma", "Bhatt", "Malhotra", "Menon",
  "Rao", "Joshi", "Deshmukh", "Choudhury", "Gupta", "Kapoor", "Chatterjee", "Mishra", "Mehta", "Bansal",
  "Aggarwal", "Pillai", "Pandey", "Singhania", "Mukherjee", "Saxena", "Chawla", "Bhatia", "Gowda", "Sengupta",
];
const CITIES = [
  ["Bengaluru", "Karnataka", "560001"], ["Mumbai", "Maharashtra", "400001"], ["Pune", "Maharashtra", "411001"],
  ["Delhi", "Delhi", "110001"], ["Hyderabad", "Telangana", "500001"], ["Chennai", "Tamil Nadu", "600001"],
  ["Kolkata", "West Bengal", "700001"], ["Ahmedabad", "Gujarat", "380001"], ["Kochi", "Kerala", "682001"],
  ["Jaipur", "Rajasthan", "302001"],
];
const COLLEGES = [
  ["IIT Bombay", "B.Tech", "Computer Science"], ["BITS Pilani", "B.E.", "Computer Science"], ["NIT Trichy", "B.Tech", "Information Technology"],
  ["DTU Delhi", "B.Tech", "Software Engineering"], ["RVCE Bengaluru", "B.E.", "Information Science"], ["COEP Pune", "B.Tech", "Computer Engineering"],
  ["VIT Vellore", "B.Tech", "Computer Science"], ["SRM Chennai", "B.Tech", "Data Science"], ["Christ University", "BCA", "Computer Applications"],
  ["PES University Bengaluru", "B.Tech", "Artificial Intelligence"], ["IIIT Hyderabad", "B.Tech", "Computer Science"], ["Anna University Chennai", "B.E.", "Computer Science"],
];
const DOMAINS = [
  ["Frontend", ["React", "TypeScript", "Tailwind CSS", "Next.js", "State Management"]],
  ["Backend", ["Node.js", "PostgreSQL", "REST APIs", "Redis", "Docker"]],
  ["Full Stack", ["React", "Node.js", "PostgreSQL", "GraphQL", "Tailwind CSS"]],
  ["UI/UX Design", ["Figma", "Design Systems", "User Research", "Wireframing", "Prototyping"]],
  ["Mobile", ["React Native", "TypeScript", "Mobile UI", "REST APIs", "Redux"]],
  ["Data & ML", ["Python", "SQL", "Pandas", "Scikit-Learn", "Data Visualization"]],
  ["DevOps", ["Docker", "Kubernetes", "Linux", "AWS", "CI/CD Pipelines"]],
];
const EMPLOYERS = [
  ["Meridian Labs", "Bengaluru", "Karnataka", "560001"],
  ["Orchid Fintech", "Mumbai", "Maharashtra", "400001"],
  ["Kestrel Studio", "Pune", "Maharashtra", "411001"],
  ["Lumen Analytics", "Hyderabad", "Telangana", "500001"],
];

/** 50 distinct scores, one decimal: 12 below 6 (Espresso), 20 from 6 to 7.9 (Cappuccino), 18 from 8 up (Latte). */
function scoreList() {
  const drop = new Set([4.6, 5.2, 5.8, 9.7]);
  const out = [];
  for (let t = 45; t <= 98; t++) {
    const s = t / 10;
    if (!drop.has(s)) out.push(s);
  }
  return out; // ascending, 50 values
}

/** Same pseudo-shuffle every run (stride coprime with the length). */
const permute = (arr, stride) => arr.map((_, k) => arr[(k * stride) % arr.length]);

/** Stage plan, in intern order. */
const STAGES = [
  ["pending", 6], ["rejected", 3], ["approved", 10], ["hidden", 4],
  ["interview_scheduled", 6], ["interview_done", 4], ["proposal_sent", 5], ["proposal_accepted", 3],
  ["hired_active", 6], ["completed", 3],
];
const EARLY = new Set(["pending", "rejected", "approved", "hidden"]);

function plan() {
  const stages = STAGES.flatMap(([s, n]) => Array(n).fill(s));
  const scores = scoreList();
  const low3 = scores.slice(0, 3); // rejected interns get the lowest scores
  const rest = scores.slice(3);
  const earlyN = stages.filter((s) => EARLY.has(s) && s !== "rejected").length;
  const earlyScores = permute(rest.slice(0, earlyN), 7);
  const advScores = permute(rest.slice(earlyN), 5);
  let r = 0, e = 0, a = 0;
  return stages.map((stage, i) => {
    const score = stage === "rejected" ? low3[r++] : EARLY.has(stage) ? earlyScores[e++] : advScores[a++];
    return { n: i + 1, stage, score };
  });
}

/* ── Row builders ───────────────────────────────────────────────────────── */

const clamp = (v) => Math.min(10, Math.max(3, Math.round(v * 10) / 10));

function internExtra({ n, score, stage }) {
  const college = COLLEGES[n % COLLEGES.length];
  const approval = stage === "pending" ? "Pending" : stage === "rejected" ? "Rejected" : "Approved";
  const paidAt = iso(-(8 + ((n * 7) % 55)));
  return {
    payment: {
      isPaid: true, paidAt, gateway: "razorpay", orderId: `seed_order_${pad(n)}`, paymentId: `seed_pay_${pad(n)}`,
      promoCode: null, finalAmountMinor: FEE_MINOR, discountAmountMinor: 0, originalAmountMinor: FEE_MINOR,
    },
    ratings: {
      aptitude: clamp(score + (n % 4 === 0 ? -0.5 : 0.3)),
      interview: clamp(score + (n % 5 === 0 ? 0.4 : -0.2)),
      communication: clamp(score + (n % 3 === 0 ? 0.6 : -0.3)),
      coding: clamp(score + (n % 2 === 0 ? 0.5 : -0.4)),
    },
    findternScore: score,
    approvalStatus: approval,
    ...(approval === "Pending" ? {} : { approvedAt: iso(-5), approvedBy: "seed-demo" }),
    academics: {
      level: "bachelors", score: (6.5 + (n % 30) / 10).toFixed(1), degree: college[1], status: "Pursuing",
      endYear: String(2026 + (n % 3)), scoreType: "cgpa", startYear: String(2022 + (n % 3)), institution: college[0],
      certifications: [], specialization: college[2], marksheetUploads: [], professionalCourses: [],
    },
    languages: [
      { id: "lang-en", language: "english", level: "professional", read: "yes", write: "yes", speak: "yes" },
      { id: "lang-hi", language: "hindi", level: "native", read: "yes", write: "yes", speak: "yes" },
    ],
    extracurricular: [{ id: "act-1", activity: ["Chess", "Cricket", "Debate", "Photography", "Robotics club"][n % 5], level: "Intermediate" }],
    emergencyPhone: `61000000${pad(n)}`, emergencyCountryCode: "+91", secondPocPhone: null, secondPocCountryCode: "+91",
    bankDetails: { bankName: "Seed Bank", ifscCode: "SEED0000001", accountNumber: `10000000${pad(n)}`, accountHolderName: `${FIRST[n - 1]} ${LAST[(n * 7) % LAST.length]}`, upiId: null },
    ndaAcceptedAt: iso(-25),
    profileSubmittedAt: iso(-25),
    openToWork: stage !== "hidden",
  };
}

const offer = (i, roleTitle, duration = "3m") => ({
  jd: "<p>Own a small slice of the product. Weekly demos.</p>", mode: "remote", laptop: "candidate", shiftTo: "18:00", currency: "INR",
  duration, location: "Remote", timezone: "Asia/Kolkata", roleTitle, shiftFrom: "09:00",
  startDate: dateOnly(7 + i), totalPrice: 24000, hourlyRate: 150, monthlyHours: 176,
  monthlyAmount: 26400, weeklySchedule: "mon_fri", workFromHomeDays: 0, paidLeavesPerMonth: 1, workFromOfficeDays: 0,
});

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

/* ── Main ───────────────────────────────────────────────────────────────── */

async function main() {
  const url = stagingDatabaseUrl();
  const host = new URL(url).hostname;
  const client = new pg.Client({ connectionString: url, ssl: sslFor(), options: "-c TimeZone=UTC" });
  await client.connect();
  const q = (sql, params = []) => client.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  console.log(`[seed-demo] target host: ${host}  mode: ${COMMIT ? "WRITE (--yes)" : "dry run (rolled back)"}`);

  await q("BEGIN");
  try {
    // 0. Optional: empty every table (rows only). The migration record is kept so the schema stays "up to date".
    if (RESET) {
      const tables = (
        await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> ALL($1) AND table_name NOT LIKE 'website\\_%' AND table_name NOT LIKE '\\_\\_drizzle%' ORDER BY 1`, [KEEP_TABLES])
      ).rows.map((r) => r.table_name);
      const filled = [];
      for (const t of tables) {
        const n = (await one(`SELECT count(*)::int AS n FROM "${t}"`)).n;
        if (n) filled.push(`${t}:${n}`);
      }
      console.log(`[seed-demo] --reset: emptying ${tables.length} tables; rows now: ${filled.join("  ") || "none"}`);
      // No CASCADE: if a kept table ever points at a wiped one, this errors instead of silently emptying it.
      await q(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY`);
    }

    // 1. Remove the previous run's rows (this domain only).
    const oldUsers = (await q(`SELECT id FROM users WHERE email LIKE $1`, [`%@${DOMAIN}`])).rows.map((r) => r.id);
    const oldEmps = (await q(`SELECT id FROM employers WHERE company_email LIKE $1`, [`%@${DOMAIN}`])).rows.map((r) => r.id);
    const oldAdmins = (await q(`SELECT id FROM admins WHERE email LIKE $1`, [`%@${DOMAIN}`])).rows.map((r) => r.id);
    console.log(`[seed-demo] replacing earlier seed rows: ${oldUsers.length} interns, ${oldEmps.length} employers, ${oldAdmins.length} admins`);
    if (oldUsers.length || oldEmps.length || oldAdmins.length) {
      const all = [...oldUsers, ...oldEmps, ...oldAdmins];
      await q(`DELETE FROM notifications WHERE recipient_id = ANY($1)`, [all]);
      await q(`DELETE FROM timesheets WHERE intern_id = ANY($1) OR employer_id = ANY($2)`, [oldUsers, oldEmps]);
      await q(`DELETE FROM interviews WHERE intern_id = ANY($1) OR employer_id = ANY($2)`, [oldUsers, oldEmps]);
      await q(`DELETE FROM proposals WHERE intern_id = ANY($1) OR employer_id = ANY($2)`, [oldUsers, oldEmps]);
      await q(`DELETE FROM employer_cart_items WHERE employer_id = ANY($1)`, [oldEmps]);
      await q(`DELETE FROM profile_views WHERE employer_id = ANY($1)`, [oldEmps]);
      await q(`DELETE FROM employer_payments WHERE employer_id = ANY($1)`, [oldEmps]);
      await q(`DELETE FROM projects WHERE employer_id = ANY($1)`, [oldEmps]);
      await q(`DELETE FROM intern_payouts WHERE intern_id = ANY($1)`, [oldUsers]);
      await q(`DELETE FROM intern_payments WHERE intern_id = ANY($1)`, [oldUsers]);
      await q(`DELETE FROM intern_document WHERE user_id = ANY($1)`, [oldUsers]);
      await q(`DELETE FROM intern_onboarding WHERE user_id = ANY($1)`, [oldUsers]);
      await q(`DELETE FROM users WHERE id = ANY($1)`, [oldUsers]);
      await q(`DELETE FROM employers WHERE id = ANY($1)`, [oldEmps]);
      await q(`DELETE FROM admins WHERE id = ANY($1)`, [oldAdmins]);
    }

    const before = {};
    for (const t of ["users", "employers", "admins", "intern_payments", "proposals", "interviews", "timesheets", "intern_payouts", "employer_payments", "projects"]) {
      before[t] = (await one(`SELECT count(*)::int AS n FROM ${t}`)).n;
    }

    const pw = await hash(PASSWORD, ARGON);

    // 2. Admin (so there is a login to look at the data).
    await q(`INSERT INTO admins (email, password, name, role) VALUES ($1,$2,'Seed Admin','super_admin')`, [`admin@${DOMAIN}`, pw]);

    // 3. Employers, two projects each.
    const employers = [];
    for (let k = 0; k < EMPLOYERS.length; k++) {
      const [company, city, state, pin] = EMPLOYERS[k];
      const e = await one(
        `INSERT INTO employers (name, company_name, company_email, email_verified, country_code, phone_number, password, agreed_to_terms,
           website_url, company_size, country, city, state, billing_pincode, primary_contact_name, primary_contact_role,
           setup_completed, onboarding_completed, is_active, terms_accepted_version, terms_accepted_at)
         VALUES ($1,$2,$3,true,'+91',$4,$5,true,'https://example.com','11-50','India',$6,$7,$8,$1,'Hiring Manager',true,true,true,$9,now()) RETURNING id`,
        [`${company} Hiring`, company, `employer${k + 1}@${DOMAIN}`, `62000000${pad(k + 1)}`, pw, city, state, pin, TERMS_VERSION],
      );
      const projects = [];
      for (let p = 0; p < 2; p++) {
        const [domain, skills] = DOMAINS[(k * 2 + p) % DOMAINS.length];
        const pr = await one(
          `INSERT INTO projects (employer_id, project_name, skills, scope_of_work, full_time_offer, location_type, preferred_locations, city, state, timezone, status)
           VALUES ($1,$2,$3,$4,$5,$6,'[]',$7,$8,'Asia/Kolkata','active') RETURNING id`,
          [e.id, `${domain} Intern`, JSON.stringify(skills.slice(0, 3)), ["short-term", "medium-term", "long-term"][(k + p) % 3], (k + p) % 2 === 0, ["remote", "onsite", "hybrid"][(k + p) % 3], city, state],
        );
        projects.push({ id: pr.id, title: `${domain} Intern` });
      }
      employers.push({ id: e.id, projects });
    }

    // 4. Interns and everything that hangs off their stage.
    const counts = {};
    for (const row of plan()) {
      const { n, stage, score } = row;
      counts[stage] = (counts[stage] ?? 0) + 1;
      const [city, state, pin] = CITIES[n % CITIES.length];
      const [domain, skills] = DOMAINS[n % DOMAINS.length];
      const college = COLLEGES[n % COLLEGES.length];
      const first = FIRST[n - 1];
      const last = LAST[(n * 7) % LAST.length];
      const email = `intern${pad(n)}@${DOMAIN}`;
      const visibility = stage === "hidden" ? "hidden" : "live";

      const u = await one(
        `INSERT INTO users (first_name, last_name, email, email_verified, is_active, country_code, phone_number, password, agreed_to_terms, role, profile_visibility, terms_accepted_version, terms_accepted_at)
         VALUES ($1,$2,$3,true,true,'+91',$4,$5,true,'intern',$6,$7,now()) RETURNING id`,
        [first, last, email, `60000000${pad(n)}`, pw, visibility, TERMS_VERSION],
      );
      const extra = internExtra(row);
      await q(
        `INSERT INTO intern_onboarding (user_id, pin_code, state, city, aadhaar_number, pan_number, bio, experience_json, skills, location_types, preferred_locations, has_laptop, preview_summary, extra_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13)`,
        [
          u.id, pin, state, city, `9990000000${pad(n)}`, `SEEDP00${pad(n)}Z`,
          `${domain} student at ${college[0]}. Builds small projects in ${skills.slice(0, 3).join(", ")} and likes shipping them.`,
          JSON.stringify([{ id: "exp-1", type: "Internship", company: "Sample Co", role: "Intern", from: "2025-06-02", to: "2025-08-29", description: "Worked on a small team project.", current: false }]),
          JSON.stringify(skills), JSON.stringify(n % 2 ? ["remote", "hybrid"] : ["onsite", "hybrid"]), JSON.stringify([city, "Bengaluru"]),
          `${college[0]}, ${college[1]} ${college[2]}. Score ${score.toFixed(1)}/10.`,
          JSON.stringify(extra),
        ],
      );
      await q(
        `INSERT INTO intern_document (user_id, profile_photo_name, profile_photo_type, profile_photo_size, pan_image_name, pan_image_type, pan_image_size)
         VALUES ($1,'seed-photo.png','image/png',1200,'seed-pan.png','image/png',1200)`,
        [u.id],
      );
      // Fee paid, in both places the app looks (see isInternPaid in src/lib/payments.ts).
      await q(
        `INSERT INTO intern_payments (intern_id, gateway, order_id, payment_id, amount_minor, currency, status, paid_at, raw)
         VALUES ($1,'razorpay',$2,$3,$4,'INR','paid',$5,'{}')`,
        [u.id, extra.payment.orderId, extra.payment.paymentId, FEE_MINOR, extra.payment.paidAt],
      );

      // Stage-specific rows.
      const emp = employers[n % employers.length];
      const proj = emp.projects[n % 2];
      const interview = (status, i) => {
        const future = status === "scheduled";
        const base = future ? 2 + (i % 12) : -2 - (i % 14);
        return q(
          `INSERT INTO interviews (employer_id, intern_id, project_id, status, slot1, slot2, slot3, selected_slot, timezone, meeting_link, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,1,'Asia/Kolkata',$8,$9)`,
          [emp.id, u.id, proj.id, status, iso(base), iso(base + 1), iso(base + 2), future ? "https://meet.example.com/seed-room" : null,
           status === "completed" ? "Clear communicator, solid fundamentals." : null],
        );
      };
      const proposal = async (status, i, startOffset, duration) => {
        const o = offer(i, proj.title, duration);
        if (startOffset !== undefined) o.startDate = dateOnly(startOffset);
        const hired = status === "hired";
        return (await one(
          `INSERT INTO proposals (employer_id, intern_id, project_id, flow_type, status, currency, offer_details, ai_ratings, skills, hired_at, created_at, updated_at)
           VALUES ($1,$2,$3,'direct',$4,'INR',$5,$6,$7,$8,$9,$9) RETURNING id`,
          [emp.id, u.id, proj.id, status, JSON.stringify(o), JSON.stringify({ coding: extra.ratings.coding, overall: score, aptitude: extra.ratings.aptitude, communication: extra.ratings.communication }),
           JSON.stringify(skills.slice(0, 2)), hired ? iso(startOffset - 3) : null, iso(hired ? startOffset - 5 : -3 - (n % 10))],
        )).id;
      };
      const timesheet = async (proposalId, status, joiningOffset, period) => {
        const joining = dateOnly(joiningOffset);
        const start = addMonthsIso(joining, period);
        const end = addDaysIso(addMonthsIso(joining, period + 1), -1);
        const entries = [];
        for (let date = start; date <= end; date = addDaysIso(date, 1)) {
          const dow = new Date(date + "T00:00:00Z").getUTCDay();
          const off = dow === 0 || dow === 6;
          const present = !off && status !== "draft";
          entries.push({ date, hours: present ? 8 : 0, note: "", status: off ? "Fixed off" : present ? "Present" : "" });
        }
        const after = offsetOf(end) + 1;
        await q(
          `INSERT INTO timesheets (proposal_id, employer_id, intern_id, period_start, period_end, status, entries, submitted_at, approved_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [proposalId, emp.id, u.id, start, end, status, JSON.stringify(entries),
           status === "draft" ? null : iso(after), status === "approved" ? iso(after + 1) : null],
        );
      };
      const payout = (i, status) =>
        q(
          `INSERT INTO intern_payouts (intern_id, amount_minor, currency, status, method, reference_id, paid_at, created_at)
           VALUES ($1,2640000,'INR',$2,'bank',$3,$4,$5)`,
          [u.id, status, status === "paid" ? `SEEDREF${pad(n)}${i}` : null, status === "paid" ? iso(-i * 10) : null, iso(-i * 10)],
        );
      const employerPaid = (joinedOffset, tag) =>
        q(
          `INSERT INTO employer_payments (employer_id, gateway, order_id, payment_id, amount_minor, currency, status, paid_at, invoice_number)
           VALUES ($1,'razorpay',$2,$3,2640000,'INR','paid',$4,NULL)`,
          [emp.id, `seed_eorder_${tag}`, `seed_epay_${tag}`, iso(joinedOffset - 3)],
        );

      if (stage === "interview_scheduled") await interview("scheduled", n);
      if (stage === "interview_done") await interview("completed", n);
      if (stage === "proposal_sent") await proposal("sent", n);
      if (stage === "proposal_accepted") await proposal("accepted", n);
      if (stage === "hired_active") {
        const joined = -[12, 18, 25, 33, 38, 44][counts[stage] - 1];
        const pid = await proposal("hired", n, joined, "6m");
        await employerPaid(joined, pad(n));
        const sheetStatus = joined <= -38 ? "approved" : joined <= -33 ? "submitted" : "draft";
        await timesheet(pid, sheetStatus, joined, 0);
        if (sheetStatus === "approved") await payout(1, "paid");
      }
      if (stage === "completed") {
        const joined = -[100, 115, 130][counts[stage] - 1];
        const pid = await proposal("hired", n, joined, "3m");
        await employerPaid(joined, pad(n));
        for (let period = 0; period < 3; period++) {
          await timesheet(pid, "approved", joined, period);
          await payout(period + 1, "paid");
        }
      }
    }

    // 5. Check what we wrote before deciding to keep it.
    const seeded = await q(
      `SELECT u.id, u.first_name || ' ' || u.last_name AS name, (o.extra_data->>'findternScore')::numeric AS score,
              (o.extra_data->'payment'->>'isPaid')::boolean AS paid_flag,
              EXISTS (SELECT 1 FROM intern_payments p WHERE p.intern_id = u.id AND p.status = 'paid') AS paid_row
         FROM users u JOIN intern_onboarding o ON o.user_id = u.id WHERE u.email LIKE $1`,
      [`intern%@${DOMAIN}`],
    );
    const names = new Set(seeded.rows.map((r) => r.name));
    const scores = new Set(seeded.rows.map((r) => String(r.score)));
    const allPaid = seeded.rows.every((r) => r.paid_flag && r.paid_row);
    const bands = { espresso: 0, cappuccino: 0, latte: 0 };
    for (const r of seeded.rows) bands[Number(r.score) < 6 ? "espresso" : Number(r.score) < 8 ? "cappuccino" : "latte"]++;
    console.log(`[seed-demo] interns: ${seeded.rowCount}, distinct names: ${names.size}, distinct scores: ${scores.size}, all paid: ${allPaid}`);
    console.log("[seed-demo] bands:", JSON.stringify(bands), " stages:", JSON.stringify(counts));
    if (seeded.rowCount !== 50 || names.size !== 50 || scores.size !== 50 || !allPaid) throw new Error("Self-check failed: not 50 distinct, paid interns");

    const delta = {};
    for (const t of Object.keys(before)) delta[t] = (await one(`SELECT count(*)::int AS n FROM ${t}`)).n - before[t];
    console.log("[seed-demo] rows added per table:", JSON.stringify(delta));

    if (COMMIT) {
      await q("COMMIT");
      console.log("[seed-demo] committed.");
    } else {
      await q("ROLLBACK");
      console.log("[seed-demo] dry run: rolled back, nothing written. Re-run with --yes to keep it.");
    }
  } catch (err) {
    await q("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[seed-demo] FAILED:", e.code ?? "", e.message);
  process.exit(1);
});
