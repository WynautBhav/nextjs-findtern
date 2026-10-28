import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { promoAudienceProblem, promoDiscount, promoProblem, type PromoAudience } from "@/lib/promo-rules";

/**
 * Promo codes against a real order: shared by the intern activation payment
 * and the employer checkout. The order route prices the discount; the verify
 * route records the use once the money is real (`recordPromoUse`).
 *
 * `subjectId` is the intern or employer id - one use per code per account.
 */

type Promo = typeof schema.promoCodes.$inferSelect;
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type PromoQuote =
  | { ok: true; promo: Promo; discountMinor: number; payableMinor: number }
  | { ok: false; error: string; status: number };

export async function quotePromo(input: {
  code: string;
  subjectId: string;
  orderMinor: number;
  currency: "INR" | "USD";
  /** Who is redeeming; inferred from `subjectId` when not given. */
  audience?: PromoAudience;
  /** Part of the order no code may discount: the one-time hiring fee. */
  undiscountableMinor?: number;
}): Promise<PromoQuote> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.code, input.code.trim().toUpperCase()))
    .limit(1);
  if (!row || !row.isActive) return { ok: false, error: "Invalid promo code", status: 404 };

  const audience = input.audience ?? (await audienceOf(input.subjectId));
  const scopeProblem = promoAudienceProblem(row.appliesTo, audience);
  if (scopeProblem) return { ok: false, error: scopeProblem, status: 400 };

  const discountableMinor = input.orderMinor - (input.undiscountableMinor ?? 0);
  if (discountableMinor <= 0) return { ok: false, error: "Promo codes don't apply to the hiring fee", status: 400 };

  const problem = promoProblem(row, discountableMinor, input.currency);
  if (problem) return { ok: false, error: problem, status: 400 };

  const [priorUse] = await db
    .select({ id: schema.promoCodeUsages.id })
    .from(schema.promoCodeUsages)
    .where(and(eq(schema.promoCodeUsages.promoCodeId, row.id), eq(schema.promoCodeUsages.userId, input.subjectId)))
    .limit(1);
  if (priorUse) return { ok: false, error: "You have already used this code", status: 400 };

  const discountMinor = promoDiscount(row, discountableMinor, input.currency);
  return { ok: true, promo: row, discountMinor, payableMinor: input.orderMinor - discountMinor };
}

/** An id is an employer's if it is in `employers`; otherwise an intern's. */
async function audienceOf(subjectId: string): Promise<PromoAudience> {
  const db = getDb();
  const [employer] = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(eq(schema.employers.id, subjectId))
    .limit(1);
  return employer ? "employer" : "intern";
}

/** Idempotent: a second call for the same code and account is a no-op. */
export async function recordPromoUse(input: {
  code: string;
  subjectId: string;
  orderId: string;
  discountMinor: number;
}, db: Db | Tx = getDb()): Promise<void> {
  const [promo] = await db
    .select({ id: schema.promoCodes.id })
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.code, input.code))
    .limit(1);
  if (!promo) return;

  const inserted = await db
    .insert(schema.promoCodeUsages)
    .values({
      promoCodeId: promo.id,
      userId: input.subjectId,
      orderId: input.orderId,
      discountAppliedMinor: input.discountMinor,
    })
    .onConflictDoNothing()
    .returning({ id: schema.promoCodeUsages.id });
  if (inserted.length === 0) return;

  await db
    .update(schema.promoCodes)
    .set({ usedCount: sql`${schema.promoCodes.usedCount} + 1`, updatedAt: new Date() })
    .where(eq(schema.promoCodes.id, promo.id));
}

export const DUPLICATE_CODE = "A promo code with this name already exists. Pick a different code.";

/** Postgres unique_violation, whether thrown directly or wrapped by Drizzle. */
export function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) => (x && typeof x === "object" && "code" in x ? (x as { code: unknown }).code : undefined);
  return code(e) === "23505" || code((e as { cause?: unknown } | null)?.cause) === "23505";
}
