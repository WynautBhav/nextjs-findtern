#!/usr/bin/env node
/**
 * Dummy students for ONE college (default: Poornima): 100 each in year 2, 3 and 4,
 * joined to the college as verified members and listed on its roster, so the
 * college dashboard, drives and admin lists have realistic volume.
 *
 *   node e2e/seed-college-students.mjs                 # dry run: does everything, rolls back
 *   node e2e/seed-college-students.mjs --yes           # same, then commits
 *   --college "<name fragment>"   default "poornima"; must match exactly one active college
 *   --college-id <id>             pick one when the name matches several
 *   --per-year <n>                default 100
 *
 * ADDITIVE: no reset. It only removes its own earlier rows, found by the e-mail
 * domain @poornima.seed.findtern.test (a .test address never receives mail), and
 * touches nothing else. One transaction. Same target rules as seed-demo-interns.mjs:
 * the Neon STAGING host (e2e/lib/staging.mjs) or a loopback DB via
 * STAGING_LOCAL_DB_URL; the production server is refused there.
 *
 * Logins: s<year>-<nnn>@poornima.seed.findtern.test, password Seed#Demo2026.
 * No real payment, no e-mail: the intern fee is a plain row marked paid.
 */
import { hash } from "@node-rs/argon2";
import pg from "pg";

import { sslFor, stagingDatabaseUrl } from "./lib/staging.mjs";

const DOMAIN = "poornima.seed.findtern.test";
const PASSWORD = "Seed#Demo2026";
// Mirrors CURRENT_TERMS_VERSION in src/lib/terms.ts so the terms pop-up never blocks a demo login.
const TERMS_VERSION = "2026-11-06";
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const FEE_MINOR = 249900;
const DAY = 86_400_000;
const iso = (d) => new Date(Date.now() + d * DAY).toISOString();
const pad = (n, w = 2) => String(n).padStart(w, "0");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const COMMIT = flag("--yes");
const PER_YEAR = Number(opt("--per-year", "100"));
const YEARS = [2, 3, 4];
// B.Tech is four years: year N started (N-1) academic years before the current one (2026-27).
const START_YEAR = { 2: 2025, 3: 2024, 4: 2023 };

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
const BRANCHES = [
  ["Computer Science", "CS"], ["Information Technology", "IT"], ["Electronics & Communication", "EC"],
  ["Mechanical Engineering", "ME"], ["Civil Engineering", "CE"], ["AI & Data Science", "AD"],
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

/** Deterministic: the same inputs give the same students on every run. */
function students() {
  const out = [];
  let i = 0;
  for (const year of YEARS) {
    for (let k = 1; k <= PER_YEAR; k++, i++) {
      const [branch, code] = BRANCHES[(i * 5) % BRANCHES.length];
      // 45..98 in tenths, stepped by a stride coprime with 54 so scores spread across the three bands.
      const score = (45 + ((i * 7) % 54)) / 10;
      out.push({
        i, year, k, branch, code, score,
        first: FIRST[i % FIRST.length],
        last: LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length],
        email: `s${year}-${pad(k, 3)}@${DOMAIN}`,
        rollNo: `PU${START_YEAR[year]}${code}${pad(k, 3)}`,
        phone: `7000${pad(i + 1, 6)}`,
      });
    }
  }
  return out;
}

const clamp = (v) => Math.min(10, Math.max(3, Math.round(v * 10) / 10));

async function main() {
  const url = stagingDatabaseUrl();
  const host = new URL(url).hostname;
  const client = new pg.Client({ connectionString: url, ssl: sslFor(), options: "-c TimeZone=UTC" });
  await client.connect();
  const q = (sql, params = []) => client.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  console.log(`[seed-college] target host: ${host}  mode: ${COMMIT ? "WRITE (--yes)" : "dry run (rolled back)"}`);

  await q("BEGIN");
  try {
    // 1. Find the college. Exactly one, or stop and list the candidates.
    const collegeId = opt("--college-id", null);
    const fragment = opt("--college", "poornima");
    const found = collegeId
      ? (await q(`SELECT id, name, city, state, is_active FROM colleges WHERE id = $1`, [collegeId])).rows
      : (await q(`SELECT id, name, city, state, is_active FROM colleges WHERE name ILIKE $1 AND is_active ORDER BY name`, [`%${fragment}%`])).rows;
    console.log(`[seed-college] colleges matching: ${found.length}`);
    for (const c of found) console.log(`    ${c.id}  ${c.name}  (${c.city ?? "-"}, ${c.state ?? "-"})${c.is_active ? "" : "  INACTIVE"}`);
    if (found.length !== 1) throw new Error(found.length ? "More than one match: re-run with --college-id <id> from the list above." : "No active college matches.");
    const college = found[0];
    if (!college.is_active) throw new Error("That college is switched off.");

    // 2. Remove this script's earlier rows (this domain only).
    const old = (await q(`SELECT id FROM users WHERE email LIKE $1`, [`%@${DOMAIN}`])).rows.map((r) => r.id);
    console.log(`[seed-college] replacing earlier rows: ${old.length} students`);
    if (old.length) {
      await q(`DELETE FROM college_memberships WHERE user_id = ANY($1)`, [old]);
      await q(`DELETE FROM intern_payments WHERE intern_id = ANY($1)`, [old]);
      await q(`DELETE FROM intern_document WHERE user_id = ANY($1)`, [old]);
      await q(`DELETE FROM intern_onboarding WHERE user_id = ANY($1)`, [old]);
      await q(`DELETE FROM users WHERE id = ANY($1)`, [old]);
    }
    await q(`DELETE FROM college_roster WHERE college_id = $1 AND email LIKE $2`, [college.id, `%@${DOMAIN}`]);

    const before = {};
    for (const t of ["users", "intern_onboarding", "college_memberships", "college_roster", "intern_payments"]) {
      before[t] = (await one(`SELECT count(*)::int AS n FROM ${t}`)).n;
    }

    const pw = await hash(PASSWORD, ARGON);
    const list = students();

    // 3. Students.
    for (const s of list) {
      const [domain, skills] = DOMAINS[s.i % DOMAINS.length];
      const paidAt = iso(-(5 + ((s.i * 7) % 50)));
      const city = "Jaipur";
      const u = await one(
        `INSERT INTO users (first_name, last_name, email, email_verified, is_active, country_code, phone_number, password, agreed_to_terms, role, profile_visibility, terms_accepted_version, terms_accepted_at)
         VALUES ($1,$2,$3,true,true,'+91',$4,$5,true,'intern','live',$6,now()) RETURNING id`,
        [s.first, s.last, s.email, s.phone, pw, TERMS_VERSION],
      );
      const extra = {
        payment: {
          isPaid: true, paidAt, gateway: "razorpay", orderId: `seed_pu_order_${pad(s.i + 1, 4)}`, paymentId: `seed_pu_pay_${pad(s.i + 1, 4)}`,
          promoCode: null, finalAmountMinor: FEE_MINOR, discountAmountMinor: 0, originalAmountMinor: FEE_MINOR,
        },
        ratings: {
          aptitude: clamp(s.score + (s.i % 4 === 0 ? -0.5 : 0.3)),
          interview: clamp(s.score + (s.i % 5 === 0 ? 0.4 : -0.2)),
          communication: clamp(s.score + (s.i % 3 === 0 ? 0.6 : -0.3)),
          coding: clamp(s.score + (s.i % 2 === 0 ? 0.5 : -0.4)),
        },
        findternScore: s.score,
        approvalStatus: "Approved", approvedAt: iso(-3), approvedBy: "seed-college",
        academics: {
          level: "bachelors", score: (6.5 + (s.i % 30) / 10).toFixed(1), degree: "B.Tech", status: "Pursuing",
          endYear: String(START_YEAR[s.year] + 4), scoreType: "cgpa", startYear: String(START_YEAR[s.year]),
          institution: college.name, certifications: [], specialization: s.branch, marksheetUploads: [], professionalCourses: [],
        },
        languages: [
          { id: "lang-en", language: "english", level: "professional", read: "yes", write: "yes", speak: "yes" },
          { id: "lang-hi", language: "hindi", level: "native", read: "yes", write: "yes", speak: "yes" },
        ],
        extracurricular: [{ id: "act-1", activity: ["Chess", "Cricket", "Debate", "Photography", "Robotics club"][s.i % 5], level: "Intermediate" }],
        emergencyPhone: `7100${pad(s.i + 1, 6)}`, emergencyCountryCode: "+91", secondPocPhone: null, secondPocCountryCode: "+91",
        bankDetails: { bankName: "Seed Bank", ifscCode: "SEED0000001", accountNumber: `20000${pad(s.i + 1, 6)}`, accountHolderName: `${s.first} ${s.last}`, upiId: null },
        ndaAcceptedAt: iso(-20), profileSubmittedAt: iso(-20), openToWork: true,
      };
      await q(
        `INSERT INTO intern_onboarding (user_id, pin_code, state, city, aadhaar_number, pan_number, bio, experience_json, skills, location_types, preferred_locations, has_laptop, preview_summary, extra_data)
         VALUES ($1,'302022','Rajasthan',$2,$3,$4,$5,'[]',$6,$7,$8,true,$9,$10)`,
        [
          u.id, city, `8880${pad(s.i + 1, 8)}`, `PUSED${pad(s.i + 1, 4)}Z`,
          `Year ${s.year} ${s.branch} student at ${college.name}. Builds small ${domain.toLowerCase()} projects in ${skills.slice(0, 3).join(", ")}.`,
          JSON.stringify(skills), JSON.stringify(s.i % 2 ? ["remote", "hybrid"] : ["onsite", "hybrid"]), JSON.stringify([city, "Delhi"]),
          `${college.name}, B.Tech ${s.branch}, year ${s.year}. Score ${s.score.toFixed(1)}/10.`,
          JSON.stringify(extra),
        ],
      );
      await q(
        `INSERT INTO intern_document (user_id, profile_photo_name, profile_photo_type, profile_photo_size, pan_image_name, pan_image_type, pan_image_size)
         VALUES ($1,'seed-photo.png','image/png',1200,'seed-pan.png','image/png',1200)`,
        [u.id],
      );
      await q(
        `INSERT INTO intern_payments (intern_id, gateway, order_id, payment_id, amount_minor, currency, status, paid_at, raw)
         VALUES ($1,'razorpay',$2,$3,$4,'INR','paid',$5,'{}')`,
        [u.id, extra.payment.orderId, extra.payment.paymentId, FEE_MINOR, paidAt],
      );
      await q(
        `INSERT INTO college_roster (college_id, email, name, roll_no, year, branch) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (college_id, email) DO NOTHING`,
        [college.id, s.email, `${s.first} ${s.last}`, s.rollNo, s.year, s.branch],
      );
      await q(
        `INSERT INTO college_memberships (user_id, college_id, status, verified_by, year, branch, joined_at)
         VALUES ($1,$2,'verified','roster',$3,$4,$5)`,
        [u.id, college.id, s.year, s.branch, iso(-(2 + (s.i % 30)))],
      );
    }

    // 4. Check before keeping.
    const perYear = (await q(
      `SELECT year, count(*)::int AS n FROM college_memberships WHERE college_id = $1 AND user_id IN (SELECT id FROM users WHERE email LIKE $2) GROUP BY year ORDER BY year`,
      [college.id, `%@${DOMAIN}`],
    )).rows;
    const names = (await one(`SELECT count(DISTINCT first_name || ' ' || last_name)::int AS n FROM users WHERE email LIKE $1`, [`%@${DOMAIN}`])).n;
    console.log(`[seed-college] per year: ${JSON.stringify(Object.fromEntries(perYear.map((r) => [r.year, r.n])))}  distinct names: ${names}`);
    const expected = PER_YEAR * YEARS.length;
    if (perYear.length !== YEARS.length || perYear.some((r) => r.n !== PER_YEAR)) throw new Error("Self-check failed: wrong count per year");
    if (names !== expected) throw new Error(`Self-check failed: ${names} distinct names, expected ${expected}`);

    const delta = {};
    for (const t of Object.keys(before)) delta[t] = (await one(`SELECT count(*)::int AS n FROM ${t}`)).n - before[t];
    console.log("[seed-college] rows added per table:", JSON.stringify(delta));

    if (COMMIT) {
      await q("COMMIT");
      console.log("[seed-college] committed.");
    } else {
      await q("ROLLBACK");
      console.log("[seed-college] dry run: rolled back, nothing written. Re-run with --yes to keep it.");
    }
  } catch (err) {
    await q("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[seed-college] FAILED:", e.code ?? "", e.message);
  process.exit(1);
});
