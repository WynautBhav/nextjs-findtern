/**
 * The admin dashboard's rows (Students | Employers | Colleges). Read-only. The numbers themselves are computed from
 * these rows in `dashboard-board-pure.ts`, so every count is the length of the list it opens. Each row reuses the
 * app's own rules: aiInterviewStatus, the admin's complete-profile set, the AI-link queue's paid flag, the CGPA queue
 * status, meetingStage, isHiredProposal, parseOffer and guaranteeState.
 */
import { sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { aiInterviewStatus, findternScoreSql, realEmployers } from "@/lib/admin/scope";
import { loadCompleteProfileIds } from "@/lib/admin/profile-state-load";
import { profileCompletion } from "@/lib/onboarding";
import { profileDocsOf } from "@/lib/admin/profile-state";
import { loadMeetings } from "@/lib/admin/meetings-load";
import { isHiredProposal } from "@/lib/hire-status";
import { getAccountType } from "@/lib/intern-account";
import { parseOffer } from "@/lib/offer";
import { guaranteeMisses, guaranteeState } from "@/lib/guarantee";
import { aiLinkState } from "@/lib/admin/ai-link-queue";
import { loadAiLinkRows } from "@/lib/admin/ai-link-queue-load";
import {
  isIndianEmployer,
  offerReplyOf,
  trackOf,
  type BoardEmployer,
  type BoardMeeting,
  type BoardOffer,
  type BoardStudent,
} from "@/lib/admin/dashboard-board-pure";

const DAY = 86_400_000;
/** Seen within this long counts as online now (as the TPO console's presence dot). */
const ONLINE_MS = 2 * 60_000;
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (v == null ? null : String(v));

export async function loadDashboardBoard(now: Date = new Date()) {
  const db = getDb();
  const NOW = now.getTime();
  const ex = <T,>(q: ReturnType<typeof sql>) => db.execute(q).then((r) => r.rows as T[]);

  const [internsRaw, onboardingRows, docs, memberships, completeIds, aiLinks, proposals, meetingsLoaded, employersRaw, driveJoins, collegesRaw] = await Promise.all([
    ex<Record<string, unknown>>(sql`
      SELECT "users".id, "users".first_name, "users".last_name, "users".email, "users".country_code, "users".phone_number, "users".created_at,
             ${aiInterviewStatus()} AS ai_status, ${findternScoreSql()} AS score,
             ${schema.internOnboarding.extraData} AS extra_data,
             greatest(p.last_seen_at, cp.last_seen_at) AS last_seen_at, p.show_activity,
             c.name AS college, c.id AS college_id, m.year, m.branch, m.status AS membership
        FROM ${schema.users}
        LEFT JOIN ${schema.internOnboarding} ON ${schema.internOnboarding.id} = (SELECT io.id FROM intern_onboarding io WHERE io.user_id = ${schema.users.id} ORDER BY io.created_at DESC LIMIT 1)
        LEFT JOIN user_presence p ON p.user_id = ${schema.users.id}
        LEFT JOIN college_presence cp ON cp.user_id = ${schema.users.id}
        LEFT JOIN college_memberships m ON m.user_id = ${schema.users.id} AND m.left_at IS NULL
        LEFT JOIN colleges c ON c.id = m.college_id
       WHERE ${schema.users.role} = 'intern'
       ORDER BY ${schema.users.createdAt}`),
    db.select().from(schema.internOnboarding),
    db.select({ userId: schema.internDocuments.userId, photo: schema.internDocuments.profilePhotoName, pan: schema.internDocuments.panImageName, aadhaar: schema.internDocuments.aadhaarImageName, createdAt: schema.internDocuments.createdAt }).from(schema.internDocuments),
    db.select({ userId: schema.collegeMemberships.userId, status: schema.collegeMemberships.status, verifiedBy: schema.collegeMemberships.verifiedBy, leftAt: schema.collegeMemberships.leftAt }).from(schema.collegeMemberships),
    loadCompleteProfileIds(),
    loadAiLinkRows(),
    ex<Record<string, unknown>>(sql`
      SELECT pr.id, pr.intern_id, pr.employer_id, pr.status, pr.offer_details, pr.created_at, pr.hired_at, pr.currency,
             ${schema.employers.companyName} AS company_name
        FROM proposals pr JOIN ${schema.employers} ON ${schema.employers.id} = pr.employer_id
       WHERE pr.status <> 'draft' AND ${realEmployers()}
       ORDER BY pr.created_at DESC`),
    // Employer meetings and drive calls, each with its one stage: the same rows /admin/meetings counts.
    loadMeetings(now),
    ex<Record<string, unknown>>(sql`
      SELECT id, company_name, name, company_email, country_code, phone_number, city, country, company_size, international_fte_status, created_at, onboarding_completed
        FROM ${schema.employers} WHERE ${realEmployers()} ORDER BY created_at`),
    // Drive joins. "Now" mirrors the campus lock (lib/college/campus-lock.ts loadActiveCampusDrives): not exited, the drive
    // not switched off, started and not ended, the college active.
    ex<{ employer_id: string; live: boolean }>(sql`
      SELECT j.employer_id,
             bool_or(j.status <> 'exited' AND d.revoked_at IS NULL AND d.starts_at <= now() AND d.ends_at > now() AND c.is_active) AS live
        FROM college_drive_employers j
        JOIN college_drives d ON d.id = j.drive_id
        JOIN colleges c ON c.id = d.college_id
       GROUP BY j.employer_id`),
    ex<Record<string, unknown>>(sql`
      SELECT c.id, c.name, c.city,
             (SELECT count(*) FROM college_roster r WHERE r.college_id = c.id)::int AS roster,
             (SELECT count(*) FROM college_drives d WHERE d.college_id = c.id AND d.revoked_at IS NULL)::int AS drives,
             (SELECT count(*) FROM college_drives d WHERE d.college_id = c.id AND d.revoked_at IS NULL AND d.starts_at <= now() AND (d.ends_at IS NULL OR d.ends_at > now()))::int AS active_drives
        FROM colleges c ORDER BY c.name`),
  ]);

  const latestOnb = new Map<string, (typeof onboardingRows)[number]>();
  for (const r of onboardingRows.sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0))) if (!latestOnb.has(r.userId)) latestOnb.set(r.userId, r);
  const memOf = new Map(memberships.filter((m) => !m.leftAt).map((m) => [m.userId, m]));
  const docOf = new Map<string, ReturnType<typeof profileDocsOf>>();
  for (const d of docs.sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0))) if (!docOf.has(d.userId)) docOf.set(d.userId, profileDocsOf(d, memOf.get(d.userId)));
  // Applied, link not sent, fee not paid: the AI-link queue's "unpaid" (pickQueue).
  const unpaid = new Set(aiLinks.filter((r) => aiLinkState(r) === "waiting" && !r.paid).map((r) => r.internId));

  // ---------- Offers ----------
  const offers: BoardOffer[] = proposals.map((p) => {
    const status = String(p.status);
    const hiredAt = p.hired_at as Date | null;
    const hired = isHiredProposal({ status, hiredAt });
    const od = obj(p.offer_details);
    const full = parseOffer(p.offer_details, p.currency as string | null).fullTime;
    return {
      id: String(p.id), internId: String(p.intern_id), employerId: String(p.employer_id), employer: String(p.company_name ?? ""),
      track: full ? "full_time" : "internship",
      status, reply: offerReplyOf({ status, hiredAt, offerDetails: p.offer_details, currency: p.currency as string | null }, now), hired,
      ppo: Boolean(full) && typeof obj(od.fullTimeOffer).baseProposalId === "string", roleTitle: str(od.roleTitle ?? od.title), createdAt: iso(p.created_at),
    };
  });
  const proposalsByIntern = Map.groupBy(proposals, (p) => String(p.intern_id));

  // ---------- Meetings ----------
  // The stage comes from meeting-stage.ts (interviewLifecycle first), never raw interviews.status: a picked time that
  // passed unmarked reads expired, and a booked one reads upcoming, as on /admin/meetings.
  const meetings: BoardMeeting[] = meetingsLoaded.rows.map((m) => ({
    id: m.id, internId: m.internId, employerId: m.employerId, employer: m.company, stage: m.stage, startsAt: m.startsAt, reason: m.reason, feedback: m.feedback,
  }));

  // ---------- Students ----------
  const students: BoardStudent[] = internsRaw.map((u) => {
    const id = String(u.id);
    const extra = obj(u.extra_data);
    const comp = profileCompletion((latestOnb.get(id) ?? null) as never, (docOf.get(id) ?? profileDocsOf(null, memOf.get(id))) as never);
    // A student who hides their activity has no last-seen time here, and is never counted as offline or never online.
    const activityHidden = u.show_activity === false;
    const lastSeenAt = activityHidden ? null : iso(u.last_seen_at);
    const aiStatus = String(u.ai_status ?? "not_applied");
    const scored = aiStatus === "completed";
    const mine = (proposalsByIntern.get(id) ?? []).map((p) => ({ status: p.status as string | null, offerDetails: p.offer_details, currency: p.currency as string | null }));
    return {
      id, name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Unnamed student",
      email: str(u.email), phone: u.phone_number ? `${u.country_code ?? ""} ${u.phone_number}`.trim() : null,
      college: str(u.college), collegeId: str(u.college_id), year: u.year == null ? null : Number(u.year), branch: str(u.branch),
      createdAt: iso(u.created_at), lastSeenAt, activityHidden, online: lastSeenAt ? NOW - new Date(lastSeenAt).getTime() < ONLINE_MS : false,
      track: trackOf(extra),
      profilePct: Math.round((comp.done / comp.total) * 100), profileComplete: completeIds.has(id),
      // Only while the latest AI interview is still at "applied": an older unpaid row under a newer one does not count.
      aiStatus, pendingPayment: aiStatus === "applied" && unpaid.has(id),
      cgpaPending: obj(extra.cgpaVerification).status === "pending",
      openToWork: extra.openToWork !== false,
      accountType: getAccountType(extra), membership: str(u.membership),
      guarantee: scored ? guaranteeState(extra, guaranteeMisses(mine, now), memOf.get(id)) : null,
      score: u.score == null ? null : Number(u.score),
    };
  });

  // ---------- Employers ----------
  const drive = new Map(driveJoins.map((j) => [String(j.employer_id), Boolean(j.live)]));
  const employers: BoardEmployer[] = employersRaw.map((e) => {
    const id = String(e.id);
    return {
      id, company: String(e.company_name ?? ""), contact: str(e.name), email: str(e.company_email),
      phone: e.phone_number ? `${e.country_code ?? ""} ${e.phone_number}`.trim() : null,
      city: str(e.city), country: str(e.country), indian: isIndianEmployer(e.country as string | null, e.country_code as string | null),
      size: str(e.company_size), onboarded: Boolean(e.onboarding_completed),
      viaDrive: drive.has(id), inDriveNow: drive.get(id) === true,
      fte: String(e.international_fte_status ?? "none"), createdAt: iso(e.created_at),
    };
  });

  // ---------- Colleges (Design 07's per-college line) ----------
  const hiredIds = new Set(offers.filter((o) => o.hired).map((o) => o.internId));
  const offerIds = new Set(offers.map((o) => o.internId));
  const colleges = collegesRaw.map((c) => {
    const st = students.filter((r) => r.collegeId === c.id);
    const n = (f: (r: BoardStudent) => boolean) => st.filter(f).map((r) => r.id);
    return {
      id: String(c.id), name: String(c.name), city: str(c.city), roster: Number(c.roster), drives: Number(c.drives), activeDrives: Number(c.active_drives),
      funnel: {
        onboarded: n(() => true), verified: n((r) => r.membership === "verified"), profile80: n((r) => r.profilePct >= 80),
        aiScored: n((r) => r.aiStatus === "completed"), gotOffer: n((r) => offerIds.has(r.id)), hired: n((r) => hiredIds.has(r.id)),
      },
      health: {
        openToWorkOff: n((r) => !r.openToWork),
        neverOnline: n((r) => !r.lastSeenAt && !r.activityHidden),
        inactive7d: n((r) => !r.activityHidden && (!r.lastSeenAt || NOW - +new Date(r.lastSeenAt) > 7 * DAY)),
        aiPending: n((r) => ["not_applied", "applied", "scheduled", "sent"].includes(r.aiStatus)),
      },
    };
  });

  return { generatedAt: now.toISOString(), students, offers, meetings, employers, colleges };
}

export type DashboardBoard = Awaited<ReturnType<typeof loadDashboardBoard>>;
export type BoardCollege = DashboardBoard["colleges"][number];
