import { and, eq, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/**
 * Phone uniqueness for the numbers the onboarding form saves (INT-05, INT-36).
 *
 * Legacy rule (server/routes.ts:12085-12126, storage.ts:1703-1755): an
 * emergency number is refused when it already belongs to someone else, as
 * another user's account number, an employer's number, another intern's
 * emergency or second contact, or an employer's escalation contact. Every
 * comparison is country code + digits, so +1 5551234567 and +91 5551234567
 * are different numbers.
 */
export async function contactPhoneTaken(
  db: ReturnType<typeof getDb>,
  internId: string,
  countryCode: string,
  phone: string,
): Promise<boolean> {
  const code = countryCode.trim();
  const digits = phone.replace(/\D/g, "");
  if (!code || !digits) return false;

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.countryCode, code), eq(schema.users.phoneNumber, digits), ne(schema.users.id, internId)))
    .limit(1);
  if (user) return true;

  const [employer] = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(
      sql`(${schema.employers.countryCode} = ${code} and ${schema.employers.phoneNumber} = ${digits})
          or (${schema.employers.escalationContactCountryCode} = ${code}
              and regexp_replace(coalesce(${schema.employers.escalationContactPhone}, ''), '\\D', '', 'g') = ${digits})`,
    )
    .limit(1);
  if (employer) return true;

  const extra = schema.internOnboarding.extraData;
  const [intern] = await db
    .select({ id: schema.internOnboarding.id })
    .from(schema.internOnboarding)
    .where(
      and(
        ne(schema.internOnboarding.userId, internId),
        sql`((coalesce(${extra} ->> 'emergencyCountryCode', '') = ${code}
               and regexp_replace(coalesce(${extra} ->> 'emergencyPhone', ''), '\\D', '', 'g') = ${digits})
             or (coalesce(${extra} ->> 'secondPocCountryCode', '') = ${code}
               and regexp_replace(coalesce(${extra} ->> 'secondPocPhone', ''), '\\D', '', 'g') = ${digits}))`,
      ),
    )
    .limit(1);
  return Boolean(intern);
}

/** Whether an employer already uses this number (the account number check on submit, INT-39). */
export async function employerHasPhone(db: ReturnType<typeof getDb>, countryCode: string, phone: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return false;
  const [row] = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(and(eq(schema.employers.countryCode, countryCode.trim() || "+91"), eq(schema.employers.phoneNumber, digits)))
    .limit(1);
  return Boolean(row);
}
