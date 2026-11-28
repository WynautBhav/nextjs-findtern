/**
 * Admin Master data rows (Students | Employers | Colleges). Read-only, and only the open tab is loaded:
 * - Students: the dashboard board's student rows (loadDashboardBoard), so signups, account types, profile, AI interview,
 *   tech/non-tech and hires are the dashboard's own numbers.
 * - Employers: one employer query (the board's columns and drive rule) plus aggregates; no student-level data.
 * - Colleges: per-college aggregates in SQL (as /admin/colleges counts students and seats); no student rows.
 * Offers carry the Proposal pipeline's bucket (proposalPipelineStatus + acceptedPayOf) and meetings the Meeting pipeline's
 * stage (loadMeetings / meetingStage), so every column sums to those pages' cards. Rows are shaped by master-data-pure.ts.
 */
import { sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { loadDashboardBoard } from "@/lib/admin/dashboard-board";
import { aiInterviewStatus, hiredWhere, openProject, realEmployers } from "@/lib/admin/scope";
import { callsByTarget, followUpOf, type CallMark, type FollowUpTarget } from "@/lib/admin/follow-ups";
import { loadSubscriptionRows } from "@/lib/subscription/admin-list-load";
import { acceptedPayOf, proposalPipelineStatus } from "@/lib/admin/proposal-pipeline";
import { loadExpiredSources } from "@/lib/admin/expired-load";
import { loadMeetings } from "@/lib/admin/meetings-load";
import {
  NO_NUDGES,
  meetTally,
  nudgeTallies,
  offerTally,
  stageOf,
  type CollegeRow,
  type EmployerRow,
  type NudgeSourceRow,
  type OfferBucketIn,
  type StudentRow,
} from "@/lib/admin/master-data-pure";

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
const str = (v: unknown) => (v == null || v === "" ? null : String(v));

/**
 * Nudges per target, from both sources in one statement: TPO nudges (college_nudges, always to a student) and Findtern
 * nudges (notifications of type 'nudge' that /api/admin/notifications writes, to an intern or an employer). The TPO's
 * own notification copies (type college_nudge_*) are not counted again.
 */
export async function loadNudgeRows(): Promise<NudgeSourceRow[]> {
  const r = await getDb().execute(sql`
    SELECT user_id AS target_id, 'tpo' AS source, count(*)::int AS n, max(created_at) AS last FROM ${schema.collegeNudges} GROUP BY user_id
    UNION ALL
    SELECT recipient_id, 'findtern', count(*)::int, max(created_at) FROM ${schema.notifications}
     WHERE type = 'nudge' AND recipient_type IN ('intern', 'employer') GROUP BY recipient_id`);
  return (r.rows as { target_id: string; source: "tpo" | "findtern"; n: number; last: Date | null }[]).map((x) => ({ targetId: String(x.target_id), source: x.source, n: Number(x.n), last: x.last }));
}

/** The current follow-up (newest log row) per target of one type, with the writing admin's name. */
/** Call 1 / Call 2 per target of one type, from the whole call log (the newest row per call wins, follow-ups.ts callsOf). */
export async function loadFollowUps(type: FollowUpTarget): Promise<Map<string, { call1: CallMark | null; call2: CallMark | null }>> {
  const r = await getDb().execute(sql`
    SELECT f.target_id, f.status, f.note, f.created_at, a.name AS by
      FROM ${schema.adminFollowUps} f LEFT JOIN ${schema.admins} a ON a.id = f.admin_id
     WHERE f.target_type = ${type}`);
  return callsByTarget((r.rows as Record<string, unknown>[]).map((x) => ({ targetId: String(x.target_id), status: String(x.status), note: str(x.note), createdAt: x.created_at as Date, by: str(x.by) })));
}

export type OfferFact = OfferBucketIn & { id: string; internId: string; employerId: string; createdAt: string | null };

/**
 * Every sent offer with its Proposal pipeline bucket and pay split, built as the pipeline page builds them: the stored
 * status, the open-checkout freeze (loadExpiredSources openOrderIds), proposalPipelineStatus and acceptedPayOf. So the
 * offer columns sum to the pipeline's cards, and "waiting on payment" is the sidebar badge's set.
 */
export async function loadOfferFacts(now: Date): Promise<OfferFact[]> {
  const [r, { openOrderIds }] = await Promise.all([
    getDb().execute(sql`
      SELECT pr.id, pr.intern_id, pr.employer_id, pr.status, pr.hired_at, pr.offer_details, pr.currency, pr.created_at
        FROM proposals pr JOIN ${schema.employers} ON ${schema.employers.id} = pr.employer_id
       WHERE pr.status <> 'draft' AND ${realEmployers()}`),
    loadExpiredSources(now),
  ]);
  const out: OfferFact[] = [];
  for (const p of r.rows as Record<string, unknown>[]) {
    const id = String(p.id);
    const status = String(p.status);
    const bucket = proposalPipelineStatus({ status, hiredAt: p.hired_at as Date | null, offerDetails: p.offer_details, currency: p.currency as string | null, hasOpenOrder: status === "accepted" && openOrderIds.has(id) }, now);
    if (bucket) out.push({ id, internId: String(p.intern_id), employerId: String(p.employer_id), createdAt: iso(p.created_at), bucket, pay: acceptedPayOf(bucket, status) });
  }
  return out;
}

export async function loadStudentRows(now: Date): Promise<StudentRow[]> {
  const db = getDb();
  const [board, cities, nudges, followUps, facts] = await Promise.all([
    loadDashboardBoard(now),
    db.execute(sql`SELECT DISTINCT ON (user_id) user_id, city FROM ${schema.internOnboarding} ORDER BY user_id, created_at DESC`),
    loadNudgeRows(),
    loadFollowUps("student"),
    loadOfferFacts(now),
  ]);
  const city = new Map<string, string>();
  for (const r of cities.rows as Record<string, unknown>[]) {
    const c = typeof r.city === "string" ? r.city.trim() : "";
    if (c) city.set(String(r.user_id), c);
  }
  const tallies = nudgeTallies(nudges);
  const factsBy = Map.groupBy(facts, (o) => o.internId);
  const offersBy = Map.groupBy(board.offers, (o) => o.internId);
  const meetsBy = Map.groupBy(board.meetings, (m) => m.internId);
  return board.students.map((s) => {
    const mine = factsBy.get(s.id) ?? [];
    const hiredOffers = (offersBy.get(s.id) ?? []).filter((o) => o.hired);
    const meets = meetsBy.get(s.id) ?? [];
    const offers = offerTally(mine);
    const meetings = meetTally(meets.map((m) => m.stage));
    const hired = {
      internship: hiredOffers.some((o) => o.track === "internship"),
      fullTime: hiredOffers.some((o) => o.track === "full_time" && !o.ppo),
      ppo: hiredOffers.some((o) => o.track === "full_time" && o.ppo),
    };
    const isHired = hiredOffers.length > 0;
    // Nudge is derived from the admin-nudge tally, the same rows as the Findtern nudge count.
    const followUp = followUpOf(followUps.get(s.id), tallies.get(s.id)?.lastFindtern ?? null, true);
    return {
      id: s.id, name: s.name, email: s.email, phone: s.phone, college: s.college, city: city.get(s.id) ?? null,
      accountType: s.accountType, profileComplete: s.profileComplete, profilePct: s.profilePct,
      aiStatus: s.aiStatus, score: s.score, track: s.track, openToWork: s.openToWork,
      offers, meetings, hired,
      lastSeenAt: s.lastSeenAt, activityHidden: s.activityHidden, online: s.online, createdAt: s.createdAt,
      stage: stageOf({ hired: isHired, offers: offers.sent, aiStatus: s.aiStatus, profileComplete: s.profileComplete }),
      nudges: tallies.get(s.id) ?? NO_NUDGES, followUp
    };
  });
}

export async function loadEmployerRows(now: Date): Promise<EmployerRow[]> {
  const E = schema.employers;
  const [emps, nudges, followUps, subs, facts, meets] = await Promise.all([
    // The board's employer columns and its drive rule ("now" = the campus lock: not exited, drive on, started and not ended,
    // college active), plus standing, strikes, projects and presence (hidden when show_activity is off).
    getDb().execute(sql`
      SELECT ${E.id} AS id, ${E.companyName} AS company_name, ${E.name} AS name, ${E.companyEmail} AS company_email,
             ${E.countryCode} AS country_code, ${E.phoneNumber} AS phone_number, ${E.city} AS city,
             ${E.internationalFteStatus} AS fte, ${E.createdAt} AS created_at,
             ${E.isActive} AS is_active, ${E.frozenAt} AS frozen_at, ${E.emailVerified} AS email_verified,
             EXISTS (SELECT 1 FROM college_drive_employers j WHERE j.employer_id = ${E.id}) AS via_drive,
             EXISTS (SELECT 1 FROM college_drive_employers j JOIN college_drives d ON d.id = j.drive_id JOIN colleges c ON c.id = d.college_id
                      WHERE j.employer_id = ${E.id} AND j.status <> 'exited' AND d.revoked_at IS NULL AND d.starts_at <= now() AND d.ends_at > now() AND c.is_active) AS in_drive_now,
             (SELECT count(*)::int FROM ${schema.accountStrikes} s WHERE s.user_type = 'employer' AND s.user_id = ${E.id} AND s.kind IN ('warning', 'freeze')) AS strikes,
             (SELECT count(*)::int FROM ${schema.projects} WHERE ${schema.projects.employerId} = ${E.id}) AS projects_total,
             (SELECT count(*)::int FROM ${schema.projects} WHERE ${schema.projects.employerId} = ${E.id} AND ${openProject()}) AS projects_open,
             p.last_seen_at, p.show_activity
        FROM ${E} LEFT JOIN user_presence p ON p.user_id = ${E.id}
       WHERE ${realEmployers()}
       ORDER BY ${E.createdAt}`),
    loadNudgeRows(),
    loadFollowUps("employer"),
    // Pro is the subscriptions page's own status; a failed read shows "None" rather than failing the page.
    loadSubscriptionRows(now).then((r) => r.rows).catch((err) => { console.error("[master-data] subscriptions", err); return []; }),
    loadOfferFacts(now),
    loadMeetings(now),
  ]);
  const proOf = new Map(subs.map((s) => [s.employerId, s.status]));
  const tallies = nudgeTallies(nudges);
  const factsBy = Map.groupBy(facts, (o) => o.employerId);
  const meetsBy = Map.groupBy(meets.rows, (m) => m.employerId);
  return (emps.rows as Record<string, unknown>[]).map((f) => {
    const id = String(f.id);
    const mine = factsBy.get(id) ?? [];
    const mm = meetsBy.get(id) ?? [];
    const offers = offerTally(mine);
    const meetings = meetTally(mm.map((m) => m.stage));
    const frozen = f.frozen_at != null;
    const active = f.is_active !== false;
    const projectsTotal = Number(f.projects_total ?? 0);
    const projectsOpen = Number(f.projects_open ?? 0);
    const activityHidden = f.show_activity === false;
    const lastActiveAt = activityHidden ? null : iso(f.last_seen_at);
    const createdAt = iso(f.created_at);
    const followUp = followUpOf(followUps.get(id), tallies.get(id)?.lastFindtern ?? null, true);
    return {
      id, company: String(f.company_name ?? ""), contact: str(f.name), email: str(f.company_email),
      phone: f.phone_number ? `${f.country_code ?? ""} ${f.phone_number}`.trim() : null, city: str(f.city),
      emailVerified: Boolean(f.email_verified), fte: String(f.fte ?? "none"), active, frozen,
      strikes: Number(f.strikes ?? 0), pro: proOf.get(id) ?? "none", viaDrive: Boolean(f.via_drive), inDriveNow: Boolean(f.in_drive_now),
      projectsTotal, projectsOpen, offers, meetings,
      lastActiveAt, activityHidden, createdAt, nudges: tallies.get(id) ?? NO_NUDGES, followUp
    };
  });
}

/**
 * Colleges worth a row: partners, and any college with students, drives or a seat code (the directory itself holds
 * every college in India, so the rest is left out). Students joined = memberships not left (as /admin/colleges); seats =
 * the college's TPO promo code, max_usages bought and used_count used (summed if a college ever has more than one).
 * Placed, offers and not interviewed are SQL aggregates over the college's intern members with the shared rules
 * (hiredWhere, realEmployers, aiInterviewStatus: the board's "AI pending" = not applied, applied, scheduled or sent).
 */
export async function loadCollegeRows(): Promise<CollegeRow[]> {
  const db = getDb();
  const [raw, members, followUps] = await Promise.all([
    db.execute(sql`
      WITH c AS (
        SELECT c.* FROM ${schema.colleges} c
         WHERE c.is_partner
            OR EXISTS (SELECT 1 FROM ${schema.collegeMemberships} m WHERE m.college_id = c.id AND m.left_at IS NULL)
            OR EXISTS (SELECT 1 FROM ${schema.collegeDrives} d WHERE d.college_id = c.id)
            OR EXISTS (SELECT 1 FROM ${schema.promoCodes} pc WHERE pc.college_id = c.id))
      SELECT c.id, c.name, c.city, c.is_partner, c.created_at,
             (SELECT count(*)::int FROM ${schema.collegeMemberships} m WHERE m.college_id = c.id AND m.left_at IS NULL) AS students,
             (SELECT coalesce(sum(pc.max_usages), 0)::int FROM ${schema.promoCodes} pc WHERE pc.college_id = c.id) AS seats_bought,
             (SELECT coalesce(sum(pc.used_count), 0)::int FROM ${schema.promoCodes} pc WHERE pc.college_id = c.id) AS seats_used,
             (SELECT count(*)::int FROM ${schema.collegeDrives} d WHERE d.college_id = c.id) AS drives,
             EXISTS (SELECT 1 FROM ${schema.collegeDrives} d WHERE d.college_id = c.id AND d.revoked_at IS NULL AND d.starts_at <= now() AND d.ends_at > now()) AS live_drive,
             (SELECT count(*)::int FROM ${schema.collegeAdmins} a WHERE a.college_id = c.id AND a.is_active) AS tpo_count,
             (SELECT a.name FROM ${schema.collegeAdmins} a WHERE a.college_id = c.id AND a.is_active ORDER BY a.last_login_at DESC NULLS LAST, a.created_at LIMIT 1) AS tpo_name,
             (SELECT a.email FROM ${schema.collegeAdmins} a WHERE a.college_id = c.id AND a.is_active ORDER BY a.last_login_at DESC NULLS LAST, a.created_at LIMIT 1) AS tpo_email,
             greatest(
               (SELECT max(a.last_login_at) FROM ${schema.collegeAdmins} a WHERE a.college_id = c.id),
               (SELECT max(n.created_at) FROM ${schema.collegeNudges} n WHERE n.college_id = c.id),
               (SELECT max(l.created_at) FROM ${schema.collegeAuditLog} l WHERE l.college_id = c.id AND l.actor_type = 'college_admin'),
               (SELECT max(d.created_at) FROM ${schema.collegeDrives} d WHERE d.college_id = c.id)
             ) AS last_tpo_at,
             (SELECT count(*)::int FROM ${schema.collegeNudges} n WHERE n.college_id = c.id) AS nudges_sent,
             (SELECT max(n.created_at) FROM ${schema.collegeNudges} n WHERE n.college_id = c.id) AS last_nudge_at
        FROM c ORDER BY c.name`),
    db.execute(sql`
      SELECT m.college_id,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM proposals pr JOIN ${schema.employers} ON ${schema.employers.id} = pr.employer_id
                                             WHERE pr.intern_id = ${schema.users.id} AND ${realEmployers()} AND ${hiredWhere("pr")}))::int AS placed,
             coalesce(sum((SELECT count(*) FROM proposals pr JOIN ${schema.employers} ON ${schema.employers.id} = pr.employer_id
                            WHERE pr.intern_id = ${schema.users.id} AND pr.status <> 'draft' AND ${realEmployers()})), 0)::int AS offers,
             count(*) FILTER (WHERE ${aiInterviewStatus()} IN ('not_applied', 'applied', 'scheduled', 'sent'))::int AS not_interviewed
        FROM college_memberships m
        JOIN ${schema.users} ON ${schema.users.id} = m.user_id AND ${schema.users.role} = 'intern'
        LEFT JOIN ${schema.internOnboarding} ON ${schema.internOnboarding.id} = (SELECT io.id FROM intern_onboarding io WHERE io.user_id = ${schema.users.id} ORDER BY io.created_at DESC LIMIT 1)
       WHERE m.left_at IS NULL
       GROUP BY m.college_id`),
    loadFollowUps("college"),
  ]);
  const agg = new Map((members.rows as Record<string, unknown>[]).map((r) => [String(r.college_id), r]));
  return (raw.rows as Record<string, unknown>[]).map((c) => {
    const id = String(c.id);
    const a = agg.get(id);
    // Admin nudges reach students and employers only (/api/admin/notifications): a college has no Nudge mark.
    const followUp = followUpOf(followUps.get(id), null, false);
    const lastTpoAt = iso(c.last_tpo_at);
    const row = {
      id, name: String(c.name), city: str(c.city), partner: Boolean(c.is_partner),
      tpoName: str(c.tpo_name), tpoEmail: str(c.tpo_email), tpoCount: Number(c.tpo_count),
      students: Number(c.students), seatsBought: Number(c.seats_bought), seatsUsed: Number(c.seats_used),
      drives: Number(c.drives), liveDrive: Boolean(c.live_drive),
      placed: Number(a?.placed ?? 0), offers: Number(a?.offers ?? 0), notInterviewed: Number(a?.not_interviewed ?? 0),
      lastTpoAt, nudgesSent: Number(c.nudges_sent), lastNudgeAt: iso(c.last_nudge_at), createdAt: iso(c.created_at), followUp,
    };
    return row;
  });
}

export type MasterData = { students: StudentRow[] | null; employers: EmployerRow[] | null; colleges: CollegeRow[] | null };

/** Only the open tab's rows (the others stay null and are never read). */
export async function loadMasterTab(tab: "students" | "employers" | "colleges", now: Date = new Date()): Promise<MasterData> {
  return {
    students: tab === "students" ? await loadStudentRows(now) : null,
    employers: tab === "employers" ? await loadEmployerRows(now) : null,
    colleges: tab === "colleges" ? await loadCollegeRows() : null,
  };
}
