import { and, ne, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { schema } from "@/lib/db";
import { INR_PER_USD } from "@/lib/currency";

/**
 * Shared filters for admin counts and lists, so every screen agrees.
 */

/** The internal "admin" employer (legacy AI interviews) and the synthetic AI-interview employer. */
export const TEST_EMPLOYER_ID = "admin";
export const AI_INTERVIEW_EMAIL = "ai-interview@findtern.ai";

export function isTestEmployer(e: { id?: string | null; companyEmail?: string | null }): boolean {
  return e.id === TEST_EMPLOYER_ID || (e.companyEmail ?? "").toLowerCase() === AI_INTERVIEW_EMAIL;
}

/** WHERE clause keeping only real companies (expects `employers` in the query). */
export function realEmployers(): SQL {
  return and(
    ne(schema.employers.id, TEST_EMPLOYER_ID),
    sql`lower(coalesce(${schema.employers.companyEmail}, '')) <> ${AI_INTERVIEW_EMAIL}`,
  )!;
}

/** An employer id column that is not one of the test employers (no join needed). */
export function realEmployerId(col: SQLWrapper): SQL {
  return sql`${col} <> ${TEST_EMPLOYER_ID} AND ${col} NOT IN (SELECT ${schema.employers.id} FROM ${schema.employers} WHERE lower(${schema.employers.companyEmail}) = ${AI_INTERVIEW_EMAIL})`;
}

/** A project is active unless explicitly closed; empty status counts as active (legacy rule). */
export function activeProject(): SQL {
  return sql`coalesce(nullif(lower(${schema.projects.status}), ''), 'active') NOT IN ('inactive', 'closed', 'archived')`;
}

export { toInrMinor } from "./money";

/** SQL twin of `toInrMinor` for SUM()s. */
export function inrMinorSql(amount: SQLWrapper, currency: SQLWrapper): SQL<number> {
  return sql<number>`(CASE WHEN upper(coalesce(${currency}, 'INR')) = 'USD' THEN ${amount} * ${INR_PER_USD} ELSE ${amount} END)`;
}

/**
 * Legacy "profile complete" test for an `intern_onboarding` row: a row alone
 * is not enough (a file upload creates one); some real field must be filled.
 * Expects `intern_onboarding` joined (left joins give NULL -> false).
 */
export function meaningfulProfile(): SQL<boolean> {
  const o = schema.internOnboarding;
  const filled = (c: SQLWrapper) => sql`coalesce(trim(${c}), '') <> ''`;
  const nonEmpty = (c: SQLWrapper) => sql`coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(${c}) = 'array' THEN ${c} END), 0) > 0`;
  return sql<boolean>`(${o.id} IS NOT NULL AND (
    ${filled(o.linkedinUrl)} OR ${filled(o.bio)} OR ${filled(o.previewSummary)}
    OR ${filled(o.city)} OR ${filled(o.state)} OR ${filled(o.pinCode)}
    OR ${nonEmpty(o.skills)} OR ${nonEmpty(o.locationTypes)} OR ${nonEmpty(o.preferredLocations)} OR ${nonEmpty(o.experienceJson)}
    OR ${o.hasLaptop} IS NOT NULL
    OR coalesce(trim(${o.extraData}->'bankDetails'->>'accountNumber'), '') <> ''
    OR coalesce(trim(${o.extraData}->'bankDetails'->>'upiId'), '') <> ''
  ))`;
}

/**
 * Legacy AI-interview status for the intern list: from the latest AI
 * interview row, forced to "completed" once a Findtern Score exists.
 * Values: not_applied | applied | scheduled | sent | expired | completed.
 * Expects `users` and a left-joined `intern_onboarding`.
 */
export function aiInterviewStatus(): SQL<string> {
  const latest = sql`(
    SELECT lower(i.status) FROM ${schema.interviews} i
    LEFT JOIN ${schema.employers} e ON e.id = i.employer_id
    WHERE i.intern_id = ${schema.users.id}
      AND (i.employer_id = ${TEST_EMPLOYER_ID} OR lower(e.company_email) = ${AI_INTERVIEW_EMAIL})
    ORDER BY i.created_at DESC NULLS LAST LIMIT 1
  )`;
  return sql<string>`(CASE
    WHEN jsonb_typeof(${schema.internOnboarding.extraData}->'findternScore') = 'number' THEN 'completed'
    WHEN ${latest} IS NULL THEN 'not_applied'
    WHEN ${latest} IN ('waiting', 'pending') THEN 'applied'
    WHEN ${latest} IN ('scheduled', 'sent', 'expired', 'completed') THEN ${latest}
    ELSE 'applied'
  END)`;
}

/** Findtern Score as a number or NULL (expects `intern_onboarding`). */
export function findternScoreSql(): SQL<number | null> {
  return sql<number | null>`(CASE WHEN jsonb_typeof(${schema.internOnboarding.extraData}->'findternScore') = 'number' THEN (${schema.internOnboarding.extraData}->>'findternScore')::float8 END)`;
}
