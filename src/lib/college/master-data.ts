import { sql } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { todayIst } from "@/lib/offer";
import { isNewestOnboarding } from "@/lib/onboarding-newest";
import { acceptedStatusesSql, offerUnpaidExpiredSql, interviewExpiredSql, interviewUpcomingSql, interviewWaitingSql, offerLapsedSql, offerOpenSql } from "./count-rules";
import { CALL_GRACE_MS } from "./constants";
import { studentsForCollegeAdmin, type CollegeContext } from "./scope";
import { buildMasterRow, NO_MEETINGS, type MasterExtras, type MasterRow, type Meetings } from "./master-row";

const meetingsOf = (v: unknown): Meetings => {
  const m = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (k: keyof Meetings) => Number(m[k] ?? 0) || 0;
  return m.total === undefined ? NO_MEETINGS : { total: n("total"), done: n("done"), missed: n("missed"), notAccepted: n("notAccepted"), upcoming: n("upcoming"), waiting: n("waiting"), callsAccepted: n("callsAccepted"), callsNotTaken: n("callsNotTaken"), callsWaiting: n("callsWaiting") };
};

/** Onboarding keys master data may read. An allowlist: Aadhaar, PAN, bank, address and PIN are never selected. */
const EXTRA_KEYS = ["academics", "ratings", "emergencyName", "emergencyRelation", "emergencyCountryCode", "emergencyPhone", "aiFeedbackLink", "aiRecordingLink", "incruiterReportUrl", "incruiterRecordingUrl"];

/**
 * Master data for this officer's college: who they may see comes from studentsForCollegeAdmin (scoped and
 * redacted); this adds the onboarding fields and the placement counts for those same students only.
 */
export async function masterRowsForCollege(ctx: CollegeContext): Promise<MasterRow[]> {
  const students = await studentsForCollegeAdmin(ctx);
  const ids = students.filter((s) => s.status === "verified").map((s) => s.userId);
  const extras = new Map<string, MasterExtras>();
  // The same clocks the other roles read: an offer closes on its IST start day, a meeting expires after its slot.
  const now = new Date();
  const today = todayIst(now);
  const nowIso = now.toISOString();
  if (ids.length) {
    const o = schema.internOnboarding;
    const keys = sql.join(EXTRA_KEYS.map((k) => sql`${k}`), sql`, `);
    // A call request is answerable until CALL_GRACE_MS after its start, while its drive is open (scope.ts calls_pending).
    const callWaiting = sql`(dm.status = 'requested' AND dm.starts_at + make_interval(secs => ${CALL_GRACE_MS / 1000}) >= ${nowIso}::timestamp
      AND dr.ends_at > ${nowIso}::timestamp AND (dr.revoked_at IS NULL OR dr.revoked_at > ${nowIso}::timestamp))`;
    const res = await getDb().execute(sql`
      SELECT u.id AS user_id,
        (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(coalesce(${o.extraData}, '{}'::jsonb)) e WHERE e.key IN (${keys})) AS extra,
        ${o.skills} AS skills, ${o.locationTypes} AS location_types, ${o.preferredLocations} AS preferred_locations,
        ${o.hasLaptop} AS has_laptop, ${o.city} AS city, ${o.state} AS state, ${o.experienceJson} AS experience,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = u.id AND pr.status <> 'draft' AND ${realEmployerId(sql`pr.employer_id`)}) AS offers,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = u.id AND pr.status IN (${acceptedStatusesSql()})
          AND NOT ${offerUnpaidExpiredSql('pr', today)} AND ${realEmployerId(sql`pr.employer_id`)}) AS offers_accepted,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = u.id AND pr.status = 'rejected' AND ${realEmployerId(sql`pr.employer_id`)}) AS offers_rejected,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = u.id AND ${offerLapsedSql('pr', today)} AND ${realEmployerId(sql`pr.employer_id`)}) AS offers_lapsed,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = u.id AND ${offerOpenSql('pr', today)} AND ${realEmployerId(sql`pr.employer_id`)}) AS offers_open,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = u.id AND (pr.hired_at IS NOT NULL OR pr.status IN ('hired', 'completed')) AND ${realEmployerId(sql`pr.employer_id`)}) AS hired,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = u.id AND pr.status NOT IN ('draft', 'withdrawn')
          AND jsonb_typeof(pr.offer_details->'fullTimeOffer') = 'object' AND ${realEmployerId(sql`pr.employer_id`)}) AS ppo,
        (SELECT coalesce(sum(w.amount_minor), 0) FROM ${schema.collegeWalletEntries} w
          WHERE w.college_id = ${ctx.college.id} AND w.intern_id = u.id AND w.kind = 'incentive') AS earnings_minor,
        (SELECT jsonb_build_object(
            'total', count(*),
            'done', count(*) FILTER (WHERE iv.status = 'completed'),
            -- The employer marked it missed: the student did not show (interviews/[id]/mark-missed; never the employer's own no-show).
            'missed', count(*) FILTER (WHERE iv.status = 'missed'),
            -- Time passed on an invite the student never picked a slot for. A booked one (selected_slot set) the employer never
            -- closed is not the student's refusal: it stays in the rest ("missed, called off or not closed").
            'notAccepted', count(*) FILTER (WHERE iv.status IN ('declined', 'rejected') OR (iv.status = 'cancelled' AND iv.cancelled_by = 'intern') OR (${interviewExpiredSql('iv', nowIso)} AND iv.selected_slot IS NULL)),
            'upcoming', count(*) FILTER (WHERE ${interviewUpcomingSql('iv', nowIso)}),
            'waiting', count(*) FILTER (WHERE ${interviewWaitingSql('iv', nowIso)}))
          FROM ${schema.interviews} iv WHERE iv.intern_id = u.id AND ${realEmployerId(sql`iv.employer_id`)}) AS meetings,
        -- Live calls inside a campus drive (a separate table from employer meetings), by the drive board's rules
        -- (drive-board.ts): accepted = held; waiting = requested, still answerable in an open drive; the rest not taken.
        (SELECT jsonb_build_object(
            'callsAccepted', count(*) FILTER (WHERE dm.status = 'accepted'),
            'callsWaiting', count(*) FILTER (WHERE ${callWaiting}),
            'callsNotTaken', count(*) FILTER (WHERE dm.status IN ('declined', 'expired') OR (dm.status = 'requested' AND NOT ${callWaiting})))
          FROM ${schema.collegeDriveMeetings} dm JOIN ${schema.collegeDrives} dr ON dr.id = dm.drive_id
          WHERE dm.user_id = u.id AND dr.college_id = ${ctx.college.id}) AS calls
      FROM ${schema.users} u
      LEFT JOIN ${o} ON ${o.userId} = u.id AND ${isNewestOnboarding()}
      WHERE u.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `);
    for (const r of res.rows as Record<string, unknown>[]) {
      extras.set(String(r.user_id), {
        extra: (r.extra as Record<string, unknown>) ?? null,
        skills: r.skills,
        locationTypes: r.location_types,
        preferredLocations: r.preferred_locations,
        hasLaptop: typeof r.has_laptop === "boolean" ? r.has_laptop : null,
        city: (r.city as string | null) ?? null,
        state: (r.state as string | null) ?? null,
        experience: r.experience,
        offers: Number(r.offers ?? 0),
        offersAccepted: Number(r.offers_accepted ?? 0),
        offersRejected: Number(r.offers_rejected ?? 0),
        offersLapsed: Number(r.offers_lapsed ?? 0),
        offersOpen: Number(r.offers_open ?? 0),
        hired: Number(r.hired ?? 0),
        ppo: Number(r.ppo ?? 0),
        earningsMinor: Number(r.earnings_minor ?? 0),
        meetings: meetingsOf({ ...(r.meetings as object), ...(r.calls as object) }),
      });
    }
  }
  return students.map((s) => buildMasterRow(s, extras.get(s.userId)));
}
