import { sql } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { studentsForCollegeAdmin, type CollegeContext } from "./scope";
import { buildMasterRow, NO_MEETINGS, type MasterExtras, type MasterRow, type Meetings } from "./master-row";

const meetingsOf = (v: unknown): Meetings => {
  const m = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (k: keyof Meetings) => Number(m[k] ?? 0) || 0;
  return m.total === undefined ? NO_MEETINGS : { total: n("total"), done: n("done"), notAccepted: n("notAccepted"), upcoming: n("upcoming"), waiting: n("waiting") };
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
  if (ids.length) {
    const o = schema.internOnboarding;
    const keys = sql.join(EXTRA_KEYS.map((k) => sql`${k}`), sql`, `);
    const res = await getDb().execute(sql`
      SELECT ${o.userId} AS user_id,
        (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(coalesce(${o.extraData}, '{}'::jsonb)) e WHERE e.key IN (${keys})) AS extra,
        ${o.skills} AS skills, ${o.locationTypes} AS location_types, ${o.preferredLocations} AS preferred_locations,
        ${o.hasLaptop} AS has_laptop, ${o.city} AS city, ${o.state} AS state, ${o.experienceJson} AS experience,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${o.userId} AND pr.status <> 'draft' AND ${realEmployerId(sql`pr.employer_id`)}) AS offers,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${o.userId} AND pr.status IN ('accepted', 'hired', 'completed') AND ${realEmployerId(sql`pr.employer_id`)}) AS offers_accepted,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${o.userId} AND pr.status = 'rejected' AND ${realEmployerId(sql`pr.employer_id`)}) AS offers_rejected,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${o.userId} AND pr.status IN ('sent', 'interview_scheduled', 'expired') AND ${realEmployerId(sql`pr.employer_id`)}) AS offers_open,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${o.userId} AND (pr.hired_at IS NOT NULL OR pr.status IN ('hired', 'completed')) AND ${realEmployerId(sql`pr.employer_id`)}) AS hired,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${o.userId} AND pr.status NOT IN ('draft', 'withdrawn')
          AND jsonb_typeof(pr.offer_details->'fullTimeOffer') = 'object' AND ${realEmployerId(sql`pr.employer_id`)}) AS ppo,
        (SELECT coalesce(sum(w.amount_minor), 0) FROM ${schema.collegeWalletEntries} w
          WHERE w.college_id = ${ctx.college.id} AND w.intern_id = ${o.userId} AND w.kind = 'incentive') AS earnings_minor,
        (SELECT jsonb_build_object(
            'total', count(*),
            'done', count(*) FILTER (WHERE iv.status = 'completed'),
            'notAccepted', count(*) FILTER (WHERE iv.status IN ('expired', 'declined', 'rejected') OR (iv.status = 'cancelled' AND iv.cancelled_by = 'intern')),
            'upcoming', count(*) FILTER (WHERE iv.status = 'scheduled'),
            'waiting', count(*) FILTER (WHERE iv.status = 'pending'))
          FROM ${schema.interviews} iv WHERE iv.intern_id = ${o.userId} AND ${realEmployerId(sql`iv.employer_id`)}) AS meetings
      FROM ${o}
      WHERE ${o.userId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
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
        offersOpen: Number(r.offers_open ?? 0),
        hired: Number(r.hired ?? 0),
        ppo: Number(r.ppo ?? 0),
        earningsMinor: Number(r.earnings_minor ?? 0),
        meetings: meetingsOf(r.meetings),
      });
    }
  }
  return students.map((s) => buildMasterRow(s, extras.get(s.userId)));
}
