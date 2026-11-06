import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { aiInterviewStatus, findternScoreSql, realEmployerId } from "@/lib/admin/scope";
import type { SessionData } from "@/lib/security/session";
import type { StudentRow } from "@/components/college/types";
import { profileCompletion } from "@/lib/onboarding";
import {
  canCollegeAdminSee,
  checkDriveAccess,
  isStudentEligible,
  type AccessResult,
  type StudentFacts,
} from "./access";
import { aiStatusLabel, rosterOnlyFacts } from "./labels";
import { toStudentRow } from "./serialize";

/**
 * Every college-scoped read goes through here. The SQL narrows to one
 * college; the pure checks in ./access re-verify each row, so a query bug
 * cannot widen what a placement officer or drive employer sees.
 */

import { ONLINE_WINDOW_MS } from "./constants";
export { HEARTBEAT_MS, ONLINE_WINDOW_MS } from "./constants";

export type CollegeContext = {
  session: SessionData;
  admin: typeof schema.collegeAdmins.$inferSelect;
  college: typeof schema.colleges.$inferSelect;
};

export async function getCollegeContext(): Promise<CollegeContext | null> {
  const session = await getSession();
  if (!session || session.role !== "college") return null;
  const [row] = await getDb()
    .select({ admin: schema.collegeAdmins, college: schema.colleges })
    .from(schema.collegeAdmins)
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeAdmins.collegeId))
    .where(eq(schema.collegeAdmins.id, session.uid))
    .limit(1);
  if (!row || !row.admin.isActive || !row.college.isActive) return null;
  return { session, ...row };
}

/** Page guard for /college. */
export async function requireCollegeContext(): Promise<CollegeContext> {
  const ctx = await getCollegeContext();
  if (!ctx) redirect("/login?as=college");
  return ctx;
}

// ── Students ─────────────────────────────────────────────────────────────

export type CollegeStudent = StudentFacts & {
  firstName: string;
  lastName: string;
  email: string;
  verifiedBy: string | null;
  joinedAt: Date;
  lastSeenAt: Date | null;
  aiStatus: string;
  offersPending: number;
  proposals: number;
  interviewsScheduled: number;
  driveMeetings: number;
  lastActivityAt: Date | null;
  rollNo: string | null;
};

type Row = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const date = (v: unknown): Date | null => (v ? new Date(v as string) : null);

/**
 * CGPA out of the legacy academics JSON. Percentages are not converted:
 * there is no honest conversion, so a percentage student fails a CGPA
 * cutoff unless the college includes them by hand.
 */
function cgpaSql() {
  const a = sql`${schema.internOnboarding.extraData}->'academics'`;
  return sql`(CASE
    WHEN coalesce(${a}->>'scoreType', 'cgpa') = 'cgpa' AND (${a}->>'score') ~ '^[0-9]+(\\.[0-9]+)?$'
      AND (${a}->>'score')::float8 <= 10 THEN (${a}->>'score')::float8 END)`;
}

/**
 * The members of one college with everything the dashboard shows. One query;
 * the per-student counts are correlated subqueries on indexed intern ids.
 */
async function loadMembers(collegeId: string): Promise<CollegeStudent[]> {
  // Raw rows: node-postgres reads a plain `timestamp` as *local* time, which
  // made "last seen" 5h30 stale on an IST server. Every timestamp below is
  // converted to timestamptz (AT TIME ZONE 'UTC') so it parses as the instant.
  const m = schema.collegeMemberships;
  const u = schema.users;
  const o = schema.internOnboarding;
  const res = await getDb().execute(sql`
    SELECT
      ${m.userId} AS user_id, ${m.collegeId} AS college_id, ${m.status} AS status, ${m.verifiedBy} AS verified_by,
      (${m.joinedAt} AT TIME ZONE 'UTC') AS joined_at, (${m.leftAt} AT TIME ZONE 'UTC') AS left_at,
      coalesce(r.year, ${m.year}) AS year,
      coalesce(nullif(r.branch, ''), nullif(${m.branch}, ''), ${o.extraData}->'academics'->>'specialization') AS branch,
      r.roll_no AS roll_no,
      ${u.firstName} AS first_name, ${u.lastName} AS last_name, ${u.email} AS email,
      ${cgpaSql()} AS cgpa,
      ${findternScoreSql()} AS score,
      ${aiInterviewStatus()} AS ai_status,
      (p.last_seen_at AT TIME ZONE 'UTC') AS last_seen_at,
      (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${m.userId} AND ${realEmployerId(sql`pr.employer_id`)}) AS proposals,
      (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${m.userId} AND pr.status = 'sent' AND ${realEmployerId(sql`pr.employer_id`)}) AS offers_pending,
      (SELECT count(*) FROM ${schema.interviews} iv WHERE iv.intern_id = ${m.userId} AND iv.status = 'scheduled' AND ${realEmployerId(sql`iv.employer_id`)}) AS interviews_scheduled,
      (SELECT count(*) FROM ${schema.collegeDriveMeetings} dm JOIN ${schema.collegeDrives} dr ON dr.id = dm.drive_id
        WHERE dm.user_id = ${m.userId} AND dr.ends_at > (now() AT TIME ZONE 'UTC')
          AND (dr.revoked_at IS NULL OR dr.revoked_at > (now() AT TIME ZONE 'UTC'))) AS drive_meetings,
      (greatest(p.last_seen_at, ${o.updatedAt},
        (SELECT max(pr.updated_at) FROM ${schema.proposals} pr WHERE pr.intern_id = ${m.userId})) AT TIME ZONE 'UTC') AS last_activity_at
    FROM ${m}
    JOIN ${u} ON ${u.id} = ${m.userId}
    LEFT JOIN ${o} ON ${o.userId} = ${m.userId}
    LEFT JOIN ${schema.collegePresence} p ON p.user_id = ${m.userId}
    LEFT JOIN ${schema.collegeRoster} r ON r.college_id = ${m.collegeId} AND r.email = lower(${u.email})
    WHERE ${m.collegeId} = ${collegeId} AND ${m.leftAt} IS NULL
    ORDER BY ${u.firstName}, ${u.lastName}
  `);
  return (res.rows as Row[]).map((r) => ({
    userId: String(r.user_id),
    collegeId: String(r.college_id),
    status: r.status === "verified" ? "verified" : "claimed",
    verifiedBy: (r.verified_by as string | null) ?? null,
    joinedAt: new Date(r.joined_at as string),
    leftAt: date(r.left_at),
    year: num(r.year),
    branch: (r.branch as string | null) || null,
    rollNo: (r.roll_no as string | null) ?? null,
    firstName: String(r.first_name ?? ""),
    lastName: String(r.last_name ?? ""),
    email: String(r.email ?? ""),
    cgpa: num(r.cgpa),
    score: num(r.score),
    aiStatus: String(r.ai_status ?? "not_applied"),
    lastSeenAt: date(r.last_seen_at),
    proposals: Number(r.proposals ?? 0),
    offersPending: Number(r.offers_pending ?? 0),
    interviewsScheduled: Number(r.interviews_scheduled ?? 0),
    driveMeetings: Number(r.drive_meetings ?? 0),
    lastActivityAt: date(r.last_activity_at),
  }));
}

/** Students a placement officer may see: verified members of their college (they used its code), not those who only picked it. */
export async function studentsForCollegeAdmin(ctx: CollegeContext): Promise<CollegeStudent[]> {
  const rows = await loadMembers(ctx.college.id);
  return rows.filter((s) => canCollegeAdminSee(ctx.session, ctx.college.id, s));
}

/** One student, or null when outside this officer's scope. */
export async function studentForCollegeAdmin(ctx: CollegeContext, userId: string): Promise<CollegeStudent | null> {
  const rows = await studentsForCollegeAdmin(ctx);
  return rows.find((s) => s.userId === userId) ?? null;
}

/** `internProfileStatus().complete` for many students at once: the latest onboarding row and documents of each. */
async function onboardingDoneIds(userIds: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (userIds.length === 0) return done;
  const db = getDb();
  const o = schema.internOnboarding;
  const d = schema.internDocuments;
  const [rows, docs] = await Promise.all([
    db.selectDistinctOn([o.userId]).from(o).where(inArray(o.userId, userIds)).orderBy(o.userId, desc(o.createdAt)),
    db
      .selectDistinctOn([d.userId], { userId: d.userId, pan: d.panImageName, aadhaar: d.aadhaarImageName, photo: d.profilePhotoName })
      .from(d)
      .where(inArray(d.userId, userIds))
      .orderBy(d.userId, desc(d.createdAt)),
  ]);
  const docOf = new Map(docs.map((x) => [x.userId, x]));
  for (const row of rows) {
    const doc = docOf.get(row.userId);
    if (profileCompletion(row, { hasPanImage: Boolean(doc?.pan), hasAadhaarImage: Boolean(doc?.aadhaar), hasPhoto: Boolean(doc?.photo) }).complete) done.add(row.userId);
  }
  return done;
}

/**
 * The placement officer's list: verified students (full rows, openable), plus every roster row that is not one of
 * them, as a status-only row (name and roll from the college's own file; no profile, no link). Each carries the
 * four funnel facts that `tpoStatus` turns into one label.
 */
export async function tpoStudentList(ctx: CollegeContext, members?: CollegeStudent[]): Promise<StudentRow[]> {
  const db = getDb();
  const collegeId = ctx.college.id;
  const verified = members ?? (await studentsForCollegeAdmin(ctx));
  const r = schema.collegeRoster;
  const m = schema.collegeMemberships;
  const [rosterRes, usageRes] = await Promise.all([
    // `user_id` is the roster row's matched user (set only by a verified email or an admin link) and only while that
    // user holds an active membership of THIS college. No other table of the student is read: a roster row never
    // leaks onboarding or interview progress of someone who has not verified with this college.
    db.execute(sql`
      SELECT ${r.email} AS email, ${r.name} AS name, ${r.rollNo} AS roll_no, ${r.year} AS year, ${r.branch} AS branch,
        (CASE WHEN EXISTS (
          SELECT 1 FROM ${m} WHERE ${m.userId} = ${r.matchedUserId} AND ${m.collegeId} = ${collegeId} AND ${m.leftAt} IS NULL
        ) THEN ${r.matchedUserId} END) AS user_id
      FROM ${r}
      WHERE ${r.collegeId} = ${collegeId}
      ORDER BY ${r.name}, ${r.email}
    `),
    db
      .select({ userId: schema.promoCodeUsages.userId })
      .from(schema.promoCodeUsages)
      .innerJoin(schema.promoCodes, eq(schema.promoCodes.id, schema.promoCodeUsages.promoCodeId))
      .where(eq(schema.promoCodes.collegeId, collegeId)),
  ]);
  const verifiedIds = new Set(verified.map((v) => v.userId));
  const roster = (rosterRes.rows as Row[]).filter(
    (x) => !verified.some((v) => v.email.trim().toLowerCase() === x.email) && !(x.user_id && verifiedIds.has(String(x.user_id))),
  );
  const codeUsed = new Set(usageRes.map((u) => u.userId));
  const doneIds = await onboardingDoneIds(verified.map((v) => v.userId));

  const rows: StudentRow[] = verified.map((s) => ({
    ...toStudentRow(s),
    tpo: { registered: true, onboardingDone: doneIds.has(s.userId), codeUsed: codeUsed.has(s.userId), aiDone: aiStatusLabel(s.aiStatus).done },
  }));
  for (const x of roster) {
    const uid = x.user_id ? String(x.user_id) : null;
    const tpo = rosterOnlyFacts({ memberUserId: uid, codeUsed: uid !== null && codeUsed.has(uid) });
    rows.push({
      userId: `roster:${String(x.email)}`,
      name: String(x.name ?? ""),
      email: String(x.email),
      rollNo: (x.roll_no as string | null) ?? null,
      status: "claimed",
      year: num(x.year),
      branch: (x.branch as string | null) ?? null,
      cgpa: null,
      score: null,
      aiStatus: "not_applied",
      lastSeenAt: null,
      lastActivityAt: null,
      offersPending: 0,
      proposals: 0,
      interviewsScheduled: 0,
      driveMeetings: 0,
      collegeId,
      leftAt: null,
      tpo,
      rosterOnly: true,
    });
  }
  return rows;
}

export type CollegeParticipation = {
  roster: number;
  matched: number;
  review: number;
  members: number;
  verified: number;
  codeUses: number;
  interviewsDone: number;
  refunds: { total: number; refunded: number; open: number };
};

/** What the admin sees for one college: the roster and how far its students have got. Admin pages only. */
export async function collegeParticipation(collegeId: string): Promise<CollegeParticipation> {
  const db = getDb();
  const r = schema.collegeRoster;
  const m = schema.collegeMemberships;
  const [res, refunds] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM ${r} WHERE ${r.collegeId} = ${collegeId}) AS roster,
        (SELECT count(*)::int FROM ${r} WHERE ${r.collegeId} = ${collegeId} AND ${r.matchStatus} IN ('email', 'linked')) AS matched,
        (SELECT count(*)::int FROM ${r} WHERE ${r.collegeId} = ${collegeId} AND ${r.matchStatus} = 'review') AS review,
        (SELECT count(*)::int FROM ${m} WHERE ${m.collegeId} = ${collegeId} AND ${m.leftAt} IS NULL) AS members,
        (SELECT count(*)::int FROM ${m} WHERE ${m.collegeId} = ${collegeId} AND ${m.leftAt} IS NULL AND ${m.status} = 'verified') AS verified,
        (SELECT count(*)::int FROM ${schema.promoCodeUsages} pu JOIN ${schema.promoCodes} pc ON pc.id = pu.promo_code_id WHERE pc.college_id = ${collegeId}) AS code_uses,
        (SELECT count(*)::int FROM ${m}
          JOIN ${schema.users} ON ${schema.users.id} = ${m.userId}
          LEFT JOIN LATERAL (
            SELECT * FROM ${schema.internOnboarding} WHERE ${schema.internOnboarding.userId} = ${m.userId} ORDER BY created_at DESC LIMIT 1
          ) AS intern_onboarding ON true
          WHERE ${m.collegeId} = ${collegeId} AND ${m.leftAt} IS NULL AND ${m.status} = 'verified' AND ${aiInterviewStatus()} = 'completed') AS interviews_done
    `),
    db
      .select({ status: schema.paymentRefunds.status, n: sql<number>`count(*)::int` })
      .from(schema.paymentRefunds)
      .where(eq(schema.paymentRefunds.collegeId, collegeId))
      .groupBy(schema.paymentRefunds.status),
  ]);
  const x = (res.rows as Row[])[0] ?? {};
  const n = (k: string) => Number(x[k] ?? 0);
  const total = refunds.reduce((a, b) => a + b.n, 0);
  const refunded = refunds.find((f) => f.status === "refunded")?.n ?? 0;
  const closed = refunds.filter((f) => ["refunded", "failed", "rejected"].includes(f.status)).reduce((a, b) => a + b.n, 0);
  return {
    roster: n("roster"),
    matched: n("matched"),
    review: n("review"),
    members: n("members"),
    verified: n("verified"),
    codeUses: n("code_uses"),
    interviewsDone: n("interviews_done"),
    refunds: { total, refunded, open: total - closed },
  };
}

/** What a student's activation card says about their college before they pay. */
export async function collegeCoverFor(userId: string): Promise<import("./labels").CollegeCover | null> {
  const db = getDb();
  const [row] = await db
    .select({ name: schema.colleges.name, isPartner: schema.colleges.isPartner, isActive: schema.colleges.isActive, collegeId: schema.colleges.id })
    .from(schema.collegeMemberships)
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeMemberships.collegeId))
    .where(and(eq(schema.collegeMemberships.userId, userId), isNull(schema.collegeMemberships.leftAt)))
    .limit(1);
  if (!row) return null;
  const [code] = await db
    .select({ cap: schema.promoCodes.maxUsages, used: schema.promoCodes.usedCount, active: schema.promoCodes.isActive })
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.collegeId, row.collegeId))
    .limit(1);
  // No code row: nothing to promise. An unlimited (legacy) cap counts as plenty; a switched-off code covers nothing.
  const seatsLeft = !code ? null : !code.active ? 0 : code.cap === null ? 1_000_000 : Math.max(0, code.cap - code.used);
  return { collegeName: row.name, isPartner: row.isPartner, isActive: row.isActive, seatsLeft };
}

export type RosterCoverage = {
  rosterSize: number;
  joined: number;
  notJoined: { email: string; name: string; rollNo: string | null; year: number | null; branch: string | null }[];
  /** Picked this college but not on the roster and not domain-verified. */
  claimed: number;
};

export async function rosterCoverage(collegeId: string): Promise<RosterCoverage> {
  const r = schema.collegeRoster;
  const res = await getDb().execute(sql`
    SELECT ${r.email} AS email, ${r.name} AS name, ${r.rollNo} AS roll_no, ${r.year} AS year, ${r.branch} AS branch,
      EXISTS (
        SELECT 1 FROM ${schema.users} u JOIN ${schema.collegeMemberships} m ON m.user_id = u.id
        WHERE lower(u.email) = ${r.email} AND m.college_id = ${collegeId} AND m.left_at IS NULL
      ) AS joined
    FROM ${r} WHERE ${r.collegeId} = ${collegeId}
    ORDER BY ${r.name}
  `);
  const rows = res.rows as Row[];
  const [claimed] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.collegeMemberships)
    .where(
      and(
        eq(schema.collegeMemberships.collegeId, collegeId),
        eq(schema.collegeMemberships.status, "claimed"),
        isNull(schema.collegeMemberships.leftAt),
      ),
    );
  return {
    rosterSize: rows.length,
    joined: rows.filter((x) => x.joined).length,
    notJoined: rows
      .filter((x) => !x.joined)
      .map((x) => ({
        email: String(x.email),
        name: String(x.name ?? ""),
        rollNo: (x.roll_no as string | null) ?? null,
        year: num(x.year),
        branch: (x.branch as string | null) ?? null,
      })),
    claimed: claimed?.n ?? 0,
  };
}

// ── Presence ─────────────────────────────────────────────────────────────

export type PresenceSnapshot = {
  total: number;
  online: number;
  /** Offline, but a phone alert (web push) can reach them. */
  alertable: number;
  offline: { userId: string; name: string; rollNo: string | null; alertable: boolean }[];
  at: string;
};

/** Who is online right now among a set of students (the drive's, or the whole college). */
export async function presenceSnapshot(collegeId: string, userIds?: string[]): Promise<PresenceSnapshot> {
  const m = schema.collegeMemberships;
  const res = await getDb().execute(sql`
    SELECT ${m.userId} AS user_id, u.first_name, u.last_name, r.roll_no,
      (p.last_seen_at > now() at time zone 'utc' - make_interval(secs => ${ONLINE_WINDOW_MS / 1000})) AS online,
      EXISTS (SELECT 1 FROM ${schema.pushSubscriptions} ps WHERE ps.user_id = ${m.userId}) AS alertable
    FROM ${m}
    JOIN ${schema.users} u ON u.id = ${m.userId}
    LEFT JOIN ${schema.collegeRoster} r ON r.college_id = ${m.collegeId} AND r.email = lower(u.email)
    LEFT JOIN ${schema.collegePresence} p ON p.user_id = ${m.userId}
    WHERE ${m.collegeId} = ${collegeId} AND ${m.leftAt} IS NULL
  `);
  let rows = res.rows as Row[];
  if (userIds) {
    const want = new Set(userIds);
    rows = rows.filter((r) => want.has(String(r.user_id)));
  }
  const offline = rows
    .filter((r) => !r.online)
    .map((r) => ({
      userId: String(r.user_id),
      name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
      rollNo: (r.roll_no as string | null) ?? null,
      alertable: Boolean(r.alertable),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    total: rows.length,
    online: rows.length - offline.length,
    alertable: offline.filter((o) => o.alertable).length,
    offline,
    at: new Date().toISOString(),
  };
}

// ── Drives ───────────────────────────────────────────────────────────────

export type Drive = typeof schema.collegeDrives.$inferSelect;

/** Students an employer in this drive may see. */
export async function eligibleStudents(drive: Drive): Promise<CollegeStudent[]> {
  const rows = await loadMembers(drive.collegeId);
  return rows.filter((s) => isStudentEligible(s, drive));
}

/** Load a drive for an employer's API call and decide access. */
export async function driveForEmployer(
  driveId: string,
  session: SessionData | null,
): Promise<{ drive: Drive; college: typeof schema.colleges.$inferSelect; joined: boolean; access: AccessResult } | null> {
  const db = getDb();
  const [row] = await db
    .select({ drive: schema.collegeDrives, college: schema.colleges })
    .from(schema.collegeDrives)
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
    .where(eq(schema.collegeDrives.id, driveId))
    .limit(1);
  if (!row) return null;
  let joined = false;
  if (session?.role === "employer") {
    const [j] = await db
      .select({ id: schema.collegeDriveEmployers.id })
      .from(schema.collegeDriveEmployers)
      .where(and(eq(schema.collegeDriveEmployers.driveId, driveId), eq(schema.collegeDriveEmployers.employerId, session.uid)))
      .limit(1);
    joined = Boolean(j);
  }
  return { ...row, joined, access: checkDriveAccess({ drive: row.drive, session, joined, collegeActive: row.college.isActive }) };
}

/** The drive's own college, for a placement officer's write. Null when not theirs. */
export async function driveForCollegeAdmin(ctx: CollegeContext, driveId: string): Promise<Drive | null> {
  const [drive] = await getDb()
    .select()
    .from(schema.collegeDrives)
    .where(and(eq(schema.collegeDrives.id, driveId), eq(schema.collegeDrives.collegeId, ctx.college.id)))
    .limit(1);
  return drive ?? null;
}

export async function auditCollegeView(
  ctx: { collegeId: string; actorType: "college_admin" | "admin"; actorId: string },
  action: string,
  subjectUserId: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await getDb().insert(schema.collegeAuditLog).values({
    collegeId: ctx.collegeId,
    actorType: ctx.actorType,
    actorId: ctx.actorId,
    action,
    subjectUserId,
    meta,
  });
}
