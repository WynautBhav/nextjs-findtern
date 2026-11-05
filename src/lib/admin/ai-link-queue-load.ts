import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { feePaidSql } from "@/lib/fee-paid-sql";
import { AI_INTERVIEW_EMAIL, TEST_EMPLOYER_ID } from "@/lib/admin/scope";
import type { AiLinkRow } from "@/lib/admin/ai-link-queue";

export type AiLinkListRow = AiLinkRow & { name: string; email: string; phone: string; promo: boolean };

/** Every AI interview row with its intern; the pure helpers in ai-link-queue.ts pick and sort. */
export async function loadAiLinkRows(): Promise<AiLinkListRow[]> {
  const i = schema.interviews;
  const u = schema.users;
  const rows = await getDb()
    .select({
      interviewId: i.id,
      internId: i.internId,
      status: i.status,
      meetingLink: i.meetingLink,
      createdAt: i.createdAt,
      first: u.firstName,
      last: u.lastName,
      email: u.email,
      code: u.countryCode,
      phone: u.phoneNumber,
      paid: feePaidSql(u.id, schema.internOnboarding.extraData),
      // Paid with real money; a paid row without any is a promo or an admin "marked paid" activation.
      cash: sql<boolean>`EXISTS (SELECT 1 FROM ${schema.internPayments} ip WHERE ip.intern_id = ${u.id} AND ip.status = 'paid' AND ip.amount_minor > 0)`,
    })
    .from(i)
    .innerJoin(u, eq(u.id, i.internId))
    .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, u.id))
    .where(sql`(${i.employerId} = ${TEST_EMPLOYER_ID} OR ${i.employerId} IN (SELECT id FROM ${schema.employers} WHERE lower(company_email) = ${AI_INTERVIEW_EMAIL}))`);
  return rows.map((r) => ({
    interviewId: r.interviewId,
    internId: r.internId,
    status: r.status,
    meetingLink: r.meetingLink,
    createdAt: r.createdAt,
    paid: Boolean(r.paid),
    promo: Boolean(r.paid) && !r.cash,
    name: `${r.first} ${r.last}`.trim(),
    email: r.email,
    phone: `${r.code} ${r.phone}`.trim(),
  }));
}
