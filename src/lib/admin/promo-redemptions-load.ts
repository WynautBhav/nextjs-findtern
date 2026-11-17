import { desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { INR_PER_USD } from "@/lib/currency";

import type { Redemption } from "./promo-redemptions";

type Db = ReturnType<typeof getDb>;

/** Every use of one code, newest first: who, the order, what it charged and the discount given. */
export async function loadRedemptions(db: Db, promoId: string): Promise<Redemption[]> {
  const u = schema.promoCodeUsages;
  const rows = await db
    .select({
      userId: u.userId,
      orderId: u.orderId,
      discountMinor: u.discountAppliedMinor,
      redeemedAt: u.createdAt,
      companyName: schema.employers.companyName,
      companyEmail: schema.employers.companyEmail,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      internEmail: schema.users.email,
      employerCurrency: schema.employerPayments.currency,
      employerAmount: schema.employerPayments.amountMinor,
      internAmount: schema.internPayments.amountMinor,
    })
    .from(u)
    .leftJoin(schema.employers, eq(schema.employers.id, u.userId))
    .leftJoin(schema.users, eq(schema.users.id, u.userId))
    .leftJoin(schema.employerPayments, eq(schema.employerPayments.orderId, u.orderId))
    .leftJoin(schema.internPayments, eq(schema.internPayments.orderId, u.orderId))
    .where(eq(u.promoCodeId, promoId))
    .orderBy(desc(u.createdAt))
    .limit(10_000);
  return rows.map((r) => {
    const isEmployer = r.companyName !== null;
    return {
      who: isEmployer ? r.companyName : [r.firstName, r.lastName].filter(Boolean).join(" ") || null,
      email: isEmployer ? r.companyEmail : r.internEmail,
      kind: isEmployer ? "employer" : "intern",
      orderId: r.orderId,
      currency: r.employerCurrency === "USD" ? "USD" : "INR",
      orderAmountMinor: r.employerAmount ?? r.internAmount ?? null,
      discountMinor: r.discountMinor,
      redeemedAt: r.redeemedAt,
    } satisfies Redemption;
  });
}

/** Total discount given per code, in INR paise (USD cents at ₹100 per $1), in one grouped query. */
export async function discountGivenByCode(db: Db): Promise<Map<string, number>> {
  const u = schema.promoCodeUsages;
  const rows = await db
    .select({
      promoCodeId: u.promoCodeId,
      total: sql<number>`coalesce(sum(case when ${schema.employerPayments.currency} = 'USD' then ${u.discountAppliedMinor} * ${INR_PER_USD} else ${u.discountAppliedMinor} end), 0)::float8`,
    })
    .from(u)
    .leftJoin(schema.employerPayments, eq(schema.employerPayments.orderId, u.orderId))
    .groupBy(u.promoCodeId);
  return new Map(rows.map((r) => [r.promoCodeId, Number(r.total)]));
}
