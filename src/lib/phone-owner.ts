import { and, eq, inArray, ne, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

/**
 * Is this phone number already someone's? One answer for every place a
 * number is entered (INT-05, INT-36, EMH-32), matching the legacy rule
 * (routes.ts:3770-3800, 12100-12160, 12388-12465): a number belongs to one
 * person, so it is refused when it is already
 *  - an intern's own number (users),
 *  - an employer's own number (employers),
 *  - an intern's emergency contact or second point of contact
 *    (intern_onboarding.extra_data, legacy keys),
 *  - an employer's escalation contact.
 *
 * The country code is part of the number: +1 5551234567 and +91 5551234567
 * are different numbers. Legacy rows sometimes hold the code without its
 * "+", so both spellings match.
 *
 * `exclude` skips the caller's own rows (editing your own number, or your
 * own emergency contact) so saving an unchanged form is not refused.
 */
export async function phoneInUseAnywhere(
  countryCode: string,
  phone: string,
  exclude: { userId?: string; employerId?: string } = {},
): Promise<boolean> {
  const digits = normalizePhone(phone);
  const code = String(countryCode ?? "").trim() || "+91";
  if (!digits) return false;
  const codes = code.startsWith("+") ? [code, code.slice(1)] : [code, `+${code}`];
  const db = getDb();
  const one = { one: sql<number>`1` };

  const userWhere: SQL[] = [eq(schema.users.phoneNumber, digits), inArray(schema.users.countryCode, codes)];
  if (exclude.userId) userWhere.push(ne(schema.users.id, exclude.userId));
  const employerWhere: SQL[] = [eq(schema.employers.phoneNumber, digits), inArray(schema.employers.countryCode, codes)];
  if (exclude.employerId) employerWhere.push(ne(schema.employers.id, exclude.employerId));
  const escalationWhere: SQL[] = [
    inArray(schema.employers.escalationContactCountryCode, codes),
    sql`regexp_replace(coalesce(${schema.employers.escalationContactPhone}, ''), '\\D', '', 'g') = ${digits}`,
  ];
  if (exclude.employerId) escalationWhere.push(ne(schema.employers.id, exclude.employerId));

  const extra = schema.internOnboarding.extraData;
  const contactSql = sql`(
      (coalesce(${extra} ->> 'emergencyCountryCode', '') in (${sql.join(codes.map((c) => sql`${c}`), sql`, `)})
        and regexp_replace(coalesce(${extra} ->> 'emergencyPhone', ''), '\\D', '', 'g') = ${digits})
      or (coalesce(${extra} ->> 'secondPocCountryCode', '') in (${sql.join(codes.map((c) => sql`${c}`), sql`, `)})
        and regexp_replace(coalesce(${extra} ->> 'secondPocPhone', ''), '\\D', '', 'g') = ${digits})
    )`;
  const contactWhere: SQL[] = [contactSql];
  if (exclude.userId) contactWhere.push(sql`coalesce(${schema.internOnboarding.userId}, '') <> ${exclude.userId}`);

  const [users, employers, escalation, contacts] = await Promise.all([
    db.select(one).from(schema.users).where(and(...userWhere)).limit(1),
    db.select(one).from(schema.employers).where(and(...employerWhere)).limit(1),
    db.select(one).from(schema.employers).where(and(...escalationWhere)).limit(1),
    db.select(one).from(schema.internOnboarding).where(and(...contactWhere)).limit(1),
  ]);
  return users.length + employers.length + escalation.length + contacts.length > 0;
}
