/**
 * Seed College Partners demo data on top of `npm run db:seed`.
 *
 * ── DEMO CREDENTIALS ──────────────────────────────────────────────────
 * Placement officer: tpo@jklu.edu.in       / Findtern@2026  (JKLU, Jaipur)
 * Employer:          hiring@northwind.dev  / Findtern@2026  (opens the drive link)
 * Student (JKLU):    candidate@findtern.dev / Findtern@2026 (Sana Kapoor, verified via roster)
 * ──────────────────────────────────────────────────────────────────────
 *
 * Adds a handful of Jaipur colleges, makes JKLU a partner with a 72-student
 * roster (60 joined, 12 not yet), and opens a live drive. The drive link is
 * printed once (only its hash is stored) and written to COLLEGE_DEV_FILE.
 *
 * Idempotent: re-running replaces the JKLU demo rows, never touches anything
 * else. Dev only; refuses to run when NODE_ENV is production.
 *
 * Usage: DATABASE_URL=… node --experimental-strip-types scripts/seed-colleges.ts
 */
import { writeFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray, like, sql } from "drizzle-orm";
import pg from "pg";

import * as schema from "../src/lib/db/schema.ts";
import { acceptanceValues } from "../src/lib/terms.ts";
import { hashPassword, verifyPassword } from "../src/lib/security/password.ts";
import { withFreshCollegeCode } from "../src/lib/college/code.ts";
import { generateTpoCode } from "../src/lib/college/code.ts";
import { INCENTIVE_MINOR } from "../src/lib/college/wallet.ts";
import { capAfterPaid, seatBatchAmount } from "../src/lib/college/money.ts";
import { generateDriveToken } from "../src/lib/college/tokens.ts";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

const PASSWORD = "Findtern@2026";
const ORIGIN = process.env.PUBLIC_ORIGIN ?? "http://localhost:3200";

const COLLEGES = [
  { name: "JK Lakshmipat University", city: "Jaipur", state: "Rajasthan", aisheCode: "U-0657", slug: "jklu", emailDomains: ["jklu.edu.in"], isPartner: true, showOnWebsite: true, sortOrder: 1 },
  { name: "Poornima University", city: "Jaipur", state: "Rajasthan", aisheCode: null, slug: "poornima-university", emailDomains: ["poornima.edu.in"], isPartner: false, showOnWebsite: false, sortOrder: 10 },
  { name: "JECRC University", city: "Jaipur", state: "Rajasthan", aisheCode: null, slug: "jecrc-university", emailDomains: ["jecrcu.edu.in"], isPartner: false, showOnWebsite: false, sortOrder: 10 },
  { name: "Manipal University Jaipur", city: "Jaipur", state: "Rajasthan", aisheCode: null, slug: "manipal-university-jaipur", emailDomains: ["muj.manipal.edu"], isPartner: false, showOnWebsite: false, sortOrder: 10 },
  { name: "The LNM Institute of Information Technology", city: "Jaipur", state: "Rajasthan", aisheCode: null, slug: "lnmiit", emailDomains: ["lnmiit.ac.in"], isPartner: false, showOnWebsite: false, sortOrder: 10 },
  { name: "Malaviya National Institute of Technology", city: "Jaipur", state: "Rajasthan", aisheCode: null, slug: "mnit-jaipur", emailDomains: ["mnit.ac.in"], isPartner: false, showOnWebsite: false, sortOrder: 10 },
];

const FIRST = ["Aarav", "Diya", "Kabir", "Ishita", "Vihaan", "Ananya", "Reyansh", "Saanvi", "Arjun", "Myra", "Advait", "Kiara", "Shaurya", "Aadhya", "Rudra", "Pari", "Atharv", "Navya", "Krish", "Avni", "Dhruv", "Riya", "Yash", "Tara"];
const LAST = ["Sharma", "Agarwal", "Jain", "Meena", "Rathore", "Choudhary", "Gupta", "Saini", "Shekhawat", "Mathur", "Verma", "Khandelwal"];
const BRANCHES = ["CSE", "CSE", "CSE", "ECE", "ME", "AI & DS", "BBA"];
const SKILLS = ["React", "Python", "SQL", "Java", "Figma", "Node.js", "Excel", "C++", "Machine Learning", "Tableau"];

/** Deterministic pseudo-random so re-seeding gives the same demo. */
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: url, options: "-c TimeZone=UTC" });
  const db = drizzle(pool, { schema });

  for (const c of COLLEGES) {
    // After `db:import-colleges` the AISHE row exists under its own slug; claim it, so the insert below cannot clash on the AISHE code.
    if (c.aisheCode) await db.update(schema.colleges).set({ slug: c.slug }).where(eq(schema.colleges.aisheCode, c.aisheCode));
    // A new row gets a fresh Findtern code; an existing one keeps its code (not part of `set`).
    await withFreshCollegeCode((code) =>
      db
        .insert(schema.colleges)
        .values({ ...c, code })
        .onConflictDoUpdate({ target: schema.colleges.slug, set: { ...c } }),
    );
  }
  const [jklu] = await db.select().from(schema.colleges).where(eq(schema.colleges.slug, "jklu"));

  // Reset JKLU demo rows.
  const demoUsers = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "%@jklu.edu.in"));
  const demoIds = demoUsers.map((u) => u.id);
  const sana = (await db.select().from(schema.users).where(eq(schema.users.email, "candidate@findtern.dev")))[0];
  const memberIds = [...demoIds, ...(sana ? [sana.id] : [])];
  if (memberIds.length) {
    await db.delete(schema.collegeMemberships).where(inArray(schema.collegeMemberships.userId, memberIds));
    await db.delete(schema.collegeConsents).where(inArray(schema.collegeConsents.userId, memberIds));
    await db.delete(schema.collegePresence).where(inArray(schema.collegePresence.userId, memberIds));
    await db.delete(schema.collegeDriveMeetings).where(inArray(schema.collegeDriveMeetings.userId, memberIds));
  }
  if (demoIds.length) {
    await db.delete(schema.internOnboarding).where(inArray(schema.internOnboarding.userId, demoIds));
    await db.delete(schema.proposals).where(inArray(schema.proposals.internId, demoIds));
    await db.delete(schema.users).where(inArray(schema.users.id, demoIds));
  }
  await db.delete(schema.collegeRoster).where(eq(schema.collegeRoster.collegeId, jklu.id));
  const oldDrives = await db.select({ id: schema.collegeDrives.id }).from(schema.collegeDrives).where(eq(schema.collegeDrives.collegeId, jklu.id));
  if (oldDrives.length) {
    const ids = oldDrives.map((d) => d.id);
    await db.delete(schema.collegeDriveEmployers).where(inArray(schema.collegeDriveEmployers.driveId, ids));
    await db.delete(schema.collegeDriveShortlist).where(inArray(schema.collegeDriveShortlist.driveId, ids));
    await db.delete(schema.collegeDriveMeetings).where(inArray(schema.collegeDriveMeetings.driveId, ids));
    await db.delete(schema.collegeDrives).where(inArray(schema.collegeDrives.id, ids));
  }
  await db.delete(schema.collegeNudges).where(eq(schema.collegeNudges.collegeId, jklu.id));
  await db.delete(schema.collegeAuditLog).where(eq(schema.collegeAuditLog.collegeId, jklu.id));
  // Demo money: wipe it so the re-seed lands on the same totals.
  const [oldPromo] = await db.select({ id: schema.promoCodes.id }).from(schema.promoCodes).where(eq(schema.promoCodes.collegeId, jklu.id));
  if (oldPromo) await db.delete(schema.promoCodeUsages).where(eq(schema.promoCodeUsages.promoCodeId, oldPromo.id));
  await db.delete(schema.promoCodes).where(eq(schema.promoCodes.collegeId, jklu.id));
  await db.delete(schema.collegeSeatBatches).where(eq(schema.collegeSeatBatches.collegeId, jklu.id));
  await db.delete(schema.collegeWalletEntries).where(eq(schema.collegeWalletEntries.collegeId, jklu.id));
  await db.delete(schema.collegePayouts).where(eq(schema.collegePayouts.collegeId, jklu.id));

  // Keep the officer's stored hash when it already matches: a fresh salt changes the password version, and a running
  // server (which caches it for 30 s) then rejects the sessions of everyone who signs in right after a re-seed.
  const [existingTpo] = await db.select({ password: schema.collegeAdmins.password }).from(schema.collegeAdmins).where(eq(schema.collegeAdmins.email, "tpo@jklu.edu.in"));
  const pw = existingTpo && (await verifyPassword(PASSWORD, existingTpo.password)) ? existingTpo.password : await hashPassword(PASSWORD);
  await db
    .insert(schema.collegeAdmins)
    .values({ collegeId: jklu.id, name: "Bhavesh Sharma", email: "tpo@jklu.edu.in", password: pw, ...acceptanceValues() })
    .onConflictDoUpdate({ target: schema.collegeAdmins.email, set: { collegeId: jklu.id, password: pw, isActive: true, ...acceptanceValues() } });
  const [tpo] = await db.select().from(schema.collegeAdmins).where(eq(schema.collegeAdmins.email, "tpo@jklu.edu.in"));

  // 72 on the roster; the first 60 have joined Findtern.
  const roster: (typeof schema.collegeRoster.$inferInsert)[] = [];
  const students: { email: string; first: string; last: string; year: number; branch: string }[] = [];
  for (let i = 0; i < 72; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const year = [2, 3, 3, 4, 4][i % 5];
    const branch = pick(BRANCHES);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@jklu.edu.in`;
    roster.push({ collegeId: jklu.id, email, name: `${first} ${last}`, rollNo: `2${5 - year}JK${String(i + 1).padStart(3, "0")}`, year, branch });
    if (i < 60) students.push({ email, first, last, year, branch });
  }
  if (sana) roster.push({ collegeId: jklu.id, email: sana.email, name: `${sana.firstName} ${sana.lastName}`, rollNo: "22JK900", year: 3, branch: "CSE" });
  await db.insert(schema.collegeRoster).values(roster);

  const inserted = await db
    .insert(schema.users)
    .values(
      students.map((s, i) => ({
        firstName: s.first,
        lastName: s.last,
        email: s.email,
        emailVerified: true,
        phoneNumber: `98290${String(10000 + i).slice(-5)}`,
        countryCode: "+91",
        password: pw,
        agreedToTerms: true,
        ...acceptanceValues(),
      })),
    )
    .returning();

  const byEmail = new Map(students.map((s) => [s.email, s]));
  await db.insert(schema.internOnboarding).values(
    inserted.map((u, i) => {
      const s = byEmail.get(u.email)!;
      const interviewed = i % 6 !== 0; // 1 in 6 hasn't taken the AI interview yet
      const ratings = {
        communication: Math.round((4 + rand() * 5.5) * 10) / 10,
        coding: Math.round((3.5 + rand() * 6) * 10) / 10,
        aptitude: Math.round((4 + rand() * 5.5) * 10) / 10,
        interview: Math.round((4 + rand() * 5.5) * 10) / 10,
      };
      const score = Math.round(((ratings.communication + ratings.coding + ratings.aptitude + ratings.interview) / 4) * 10) / 10;
      const cgpa = (5.4 + rand() * 4.4).toFixed(1);
      return {
        userId: u.id,
        city: "Jaipur",
        state: "Rajasthan",
        bio: `${s.branch} student at JKLU.`,
        skills: [pick(SKILLS), pick(SKILLS), pick(SKILLS)].filter((v, j, a) => a.indexOf(v) === j).map((name, j) => ({ id: `s${j}`, name, rating: 2 })),
        locationTypes: ["remote", "hybrid"],
        hasLaptop: true,
        extraData: {
          academics: {
            level: "bachelors",
            degree: s.branch === "BBA" ? "BBA" : "B.Tech / B.E.",
            specialization: s.branch,
            institution: "JK Lakshmipat University",
            status: "Pursuing",
            startYear: String(2026 - s.year),
            endYear: String(2026 - s.year + 4),
            scoreType: "cgpa",
            score: cgpa,
          },
          ...(interviewed
            ? {
                ratings,
                findternScore: score,
                aiFeedbackLink: "https://example.org/incruiter/report-demo.pdf",
                aiRecordingLink: "https://example.org/incruiter/recording-demo.mp4",
              }
            : {}),
        },
      };
    }),
  );

  // Membership for every joined student (and Sana).
  const members = [...inserted.map((u) => ({ id: u.id, email: u.email })), ...(sana ? [{ id: sana.id, email: sana.email }] : [])];
  for (const m of members) {
    const r = roster.find((x) => x.email === m.email)!;
    await db.insert(schema.collegeMemberships).values({
      userId: m.id,
      collegeId: jklu.id,
      status: "verified",
      verifiedBy: m.email.endsWith("@jklu.edu.in") ? "email_domain" : "roster",
      year: r.year,
      branch: r.branch,
    });
  }

  // Most are online right now; a few went quiet.
  await db.insert(schema.collegePresence).values(
    members.map((m, i) => ({
      userId: m.id,
      collegeId: jklu.id,
      lastSeenAt: i % 9 === 4 ? sql`now() - interval '20 minutes'` : sql`now() - interval '10 seconds'`,
    })),
  );

  // A few offers waiting on a reply, so "offers pending" has something to chase.
  const [northwind] = await db.select().from(schema.employers).where(eq(schema.employers.companyEmail, "hiring@northwind.dev"));
  if (northwind) {
    const [project] = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.employerId, northwind.id)).limit(1);
    if (project) {
      await db.insert(schema.proposals).values(
        inserted.slice(2, 6).map((u) => ({
          employerId: northwind.id,
          internId: u.id,
          projectId: project.id,
          flowType: "direct",
          status: "sent",
          offerDetails: { roleTitle: "Frontend intern", monthlyAmount: 15000, duration: "3m" },
        })),
      );
    }
  }

  // Demo money (local and QA only). No free seats: the TPO code's cap is the paid seats.
  const tpoCode = generateTpoCode();
  await db.insert(schema.promoCodes).values({
    code: tpoCode, description: "College TPO code", discountType: "percentage", discountValue: 100, appliesTo: "intern",
    collegeId: jklu.id, usedCount: 40, maxUsages: capAfterPaid({ cap: 0, paidSeatsBefore: 0, seats: 300 }),
  });
  const [paid] = await db
    .insert(schema.collegeSeatBatches)
    .values({ collegeId: jklu.id, seats: 300, amountMinor: seatBatchAmount(300), status: "paid", method: "bank", referenceId: "UTR-DEMO-001", paidAt: new Date(), createdBy: tpo.id })
    .returning({ id: schema.collegeSeatBatches.id });
  // invoice-number.ts imports through the "@/" alias, which plain node cannot resolve, so the same counter bump is inlined.
  const fy = (() => { const n = new Date(Date.now() + 330 * 60_000); const y = n.getUTCMonth() >= 3 ? n.getUTCFullYear() : n.getUTCFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; })();
  const [counter] = await db
    .insert(schema.invoiceCounters).values({ fy, last: 1 })
    .onConflictDoUpdate({ target: schema.invoiceCounters.fy, set: { last: sql`${schema.invoiceCounters.last} + 1`, updatedAt: new Date() } })
    .returning({ last: schema.invoiceCounters.last });
  const ist = new Date(Date.now() + 330 * 60_000).toISOString();
  await db.update(schema.collegeSeatBatches).set({ invoiceNumber: `${ist.slice(8, 10)}${ist.slice(5, 7)}${ist.slice(2, 4)}-${String(counter.last).padStart(2, "0")}` }).where(eq(schema.collegeSeatBatches.id, paid.id));
  await db.insert(schema.collegeSeatBatches).values({ collegeId: jklu.id, seats: 100, amountMinor: seatBatchAmount(100), status: "pending", createdBy: tpo.id });
  await db
    .update(schema.colleges)
    .set({ state: "Rajasthan", bankAccountName: "JK Lakshmipat University", bankName: "HDFC Bank", bankAccountNumber: "000123456789", bankIfsc: "HDFC0000001" })
    .where(eq(schema.colleges.id, jklu.id));
  let incentiveTotal = 0;
  if (northwind) {
    const [project] = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.employerId, northwind.id)).limit(1);
    if (project) {
      const bands = ["standard", "skilled", "assured"] as const;
      const done = await db
        .insert(schema.proposals)
        .values(bands.map((_, i) => ({ employerId: northwind.id, internId: inserted[6 + i].id, projectId: project.id, flowType: "direct", status: "completed", hiredAt: new Date(), offerDetails: { roleTitle: "Backend intern", monthlyAmount: 15000, duration: "3m" } })))
        .returning({ id: schema.proposals.id, internId: schema.proposals.internId });
      await db.insert(schema.collegeWalletEntries).values(
        done.map((p, i) => ({ collegeId: jklu.id, kind: "incentive", amountMinor: INCENTIVE_MINOR[bands[i]], proposalId: p.id, internId: p.internId, bandId: bands[i] })),
      );
      incentiveTotal = bands.reduce((n, b) => n + INCENTIVE_MINOR[b], 0);
    }
  }
  console.log(`demo money: TPO code ${tpoCode} (40 of 300 used), batch 300 paid, batch 100 pending, wallet ₹${incentiveTotal / 100}, bank ****6789`);

  const { token, hash } = generateDriveToken();
  const now = Date.now();
  const [drive] = await db
    .insert(schema.collegeDrives)
    .values({
      collegeId: jklu.id,
      title: "Summer internship drive 2027",
      kind: "internship",
      description: "Two-month summer internships for 2nd and 3rd year students. Interviews happen live inside the drive.",
      startsAt: new Date(now - 3600_000),
      endsAt: new Date(now + 7 * 24 * 3600_000),
      eligibility: { minCgpa: 6, years: [2, 3] },
      tokenHash: hash,
      createdBy: tpo.id,
    })
    .returning();

  const link = `${ORIGIN}/drive/${token}`;
  const out = process.env.COLLEGE_DEV_FILE;
  if (out) writeFileSync(out, JSON.stringify({ driveId: drive.id, link, token }, null, 2));
  console.log(`colleges: ${COLLEGES.length}, JKLU roster: ${roster.length}, members: ${members.length}`);
  console.log(`placement officer: tpo@jklu.edu.in / ${PASSWORD}`);
  console.log(`live drive link (shown once): ${link}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

