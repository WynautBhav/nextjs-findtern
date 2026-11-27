import { sql } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { todayIst } from "@/lib/offer";
import { isNewestOnboarding } from "@/lib/onboarding-newest";
import { acceptedStatusesSql, offerUnpaidExpiredSql, offerLapsedSql, offerOpenSql } from "./count-rules";
import { loadCollegeMeets } from "./drive-interviews-db";
import { meetOutcome } from "./meet-outcome";
import { studentsForCollegeAdmin, type CollegeContext } from "./scope";
import { buildMasterRow, NO_MEETINGS, type MasterExtras, type MasterRow, type Meetings } from "./master-row";

/**
 * Each student's meetings, counted by meet-outcome.ts from the same loader the drive pages use, so the dashboard,
 * Master data and every drive screen agree. Interviews from any employer, and calls in this college's drives.
 */
async function meetingsByStudent(collegeId: string, ids: string[], now: number): Promise<Map<string, Meetings>> {
  const out = new Map<string, Meetings>();
  for (const m of await loadCollegeMeets(collegeId, ids, now)) {
    const t = out.get(m.userId) ?? { ...NO_MEETINGS };
    const o = meetOutcome(m, now);
    t.total++;
    if (o === "conducted") t.done++;
    else if (o === "booked") t.upcoming++;
    else if (o === "waiting") t.waiting++;
    else if (o === "missed") t.missed++;
    else if (o === "not_closed") t.notClosed++;
    else if (o === "not_joined") t.notJoined++;
    else if (o === "not_accepted") t.notAccepted++;
    else if (o === "withdrawn") t.withdrawn++;
    else if (o === "called_off") t.calledOff++;
    if (m.call) {
      if (o === "booked" || o === "conducted" || o === "not_joined") t.callsAccepted++;
      else if (o === "waiting") t.callsWaiting++;
      else if (o === "not_accepted") t.callsNotTaken++;
    }
    out.set(m.userId, t);
  }
  return out;
}

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
  if (ids.length) {
    const o = schema.internOnboarding;
    const keys = sql.join(EXTRA_KEYS.map((k) => sql`${k}`), sql`, `);
    const meetings = await meetingsByStudent(ctx.college.id, ids, now.getTime());
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
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = u.id AND (pr.hired_at IS NOT NULL OR pr.status IN ('hired', 'completed'))
          AND jsonb_typeof(pr.offer_details->'fullTimeOffer') IS DISTINCT FROM 'object' AND ${realEmployerId(sql`pr.employer_id`)}) AS internship,
        (SELECT count(*) FILTER (WHERE NOT (pr.offer_details->'fullTimeOffer') ? 'baseProposalId') FROM ${schema.proposals} pr WHERE pr.intern_id = u.id
          AND pr.status IN (${acceptedStatusesSql()}) AND jsonb_typeof(pr.offer_details->'fullTimeOffer') = 'object' AND ${realEmployerId(sql`pr.employer_id`)}) AS ppo_direct,
        (SELECT count(*) FILTER (WHERE (pr.offer_details->'fullTimeOffer') ? 'baseProposalId') FROM ${schema.proposals} pr WHERE pr.intern_id = u.id
          AND pr.status IN (${acceptedStatusesSql()}) AND jsonb_typeof(pr.offer_details->'fullTimeOffer') = 'object' AND ${realEmployerId(sql`pr.employer_id`)}) AS ppo_after,
        (SELECT coalesce(sum(w.amount_minor), 0) FROM ${schema.collegeWalletEntries} w
          WHERE w.college_id = ${ctx.college.id} AND w.intern_id = u.id AND w.kind = 'incentive') AS earnings_minor
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
        internship: Number(r.internship ?? 0),
        ppoDirect: Number(r.ppo_direct ?? 0),
        ppoAfter: Number(r.ppo_after ?? 0),
        earningsMinor: Number(r.earnings_minor ?? 0),
        meetings: meetings.get(String(r.user_id)) ?? NO_MEETINGS,
      });
    }
  }
  return students.map((s) => buildMasterRow(s, extras.get(s.userId)));
}
