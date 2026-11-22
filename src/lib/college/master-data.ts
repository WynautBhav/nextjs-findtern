import { sql } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { studentsForCollegeAdmin, type CollegeContext } from "./scope";
import { buildMasterRow, type MasterExtras, type MasterRow } from "./master-row";

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
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${o.userId} AND (pr.hired_at IS NOT NULL OR pr.status IN ('hired', 'completed')) AND ${realEmployerId(sql`pr.employer_id`)}) AS hired,
        (SELECT count(*) FROM ${schema.proposals} pr WHERE pr.intern_id = ${o.userId} AND pr.status NOT IN ('draft', 'withdrawn')
          AND jsonb_typeof(pr.offer_details->'fullTimeOffer') = 'object' AND ${realEmployerId(sql`pr.employer_id`)}) AS ppo,
        (SELECT coalesce(sum(w.amount_minor), 0) FROM ${schema.collegeWalletEntries} w
          WHERE w.college_id = ${ctx.college.id} AND w.intern_id = ${o.userId} AND w.kind = 'incentive') AS earnings_minor
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
        hired: Number(r.hired ?? 0),
        ppo: Number(r.ppo ?? 0),
        earningsMinor: Number(r.earnings_minor ?? 0),
      });
    }
  }
  return students.map((s) => buildMasterRow(s, extras.get(s.userId)));
}
