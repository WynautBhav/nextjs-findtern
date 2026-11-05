import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { employerPromoTooLarge, promoAudienceProblem, promoDiscount, promoProblem, seatFreeWhere, type PromoAudience } from "@/lib/promo-rules";

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
  // Postgres refuses a NUL byte in text, which was an empty 500 instead of "Invalid promo code".
  if (input.code.includes("\u0000")) return { ok: false, error: "Invalid promo code", status: 404 };
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
  if (audience === "employer" && employerPromoTooLarge(discountMinor, discountableMinor)) {
    return { ok: false, error: "This code can't be used on a hire. A code can't cover the whole stipend.", status: 400 };
  }
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
  /** A ₹0 order has no money to protect: refuse it when the cap is full. A paid order is never refused. */
  enforceCap?: boolean;
}, db: Db | Tx = getDb()): Promise<{ capped: boolean; collegeId: string | null }> {
  const [promo] = await db
    .select({ id: schema.promoCodes.id, collegeId: schema.promoCodes.collegeId })
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.code, input.code))
    .limit(1);
  if (!promo) return { capped: false, collegeId: null };

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
  if (inserted.length === 0) return { capped: false, collegeId: null };

  const bump = db
    .update(schema.promoCodes)
    .set({ usedCount: sql`${schema.promoCodes.usedCount} + 1`, updatedAt: new Date() });
  if (!input.enforceCap) {
    await bump.where(eq(schema.promoCodes.id, promo.id));
    return { capped: false, collegeId: promo.collegeId };
  }
  const took = await bump.where(seatFreeWhere(promo.id)).returning({ id: schema.promoCodes.id });
  return { capped: took.length === 0, collegeId: promo.collegeId };
}

export const DUPLICATE_CODE = "A promo code with this name already exists. Pick a different code.";

/** Which field a signup unique_violation is about, from the index name Postgres reports. */
export function uniqueMessage(e: unknown): string {
  const c = (x: unknown) => (x && typeof x === "object" && "constraint" in x ? String((x as { constraint: unknown }).constraint) : "");
  const constraint = c(e) || c((e as { cause?: unknown } | null)?.cause);
  return constraint.includes("phone") ? "Phone number already in use" : "Email already registered";
}

/** Postgres unique_violation, whether thrown directly or wrapped by Drizzle. */
export function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) => (x && typeof x === "object" && "code" in x ? (x as { code: unknown }).code : undefined);
  return code(e) === "23505" || code((e as { cause?: unknown } | null)?.cause) === "23505";
}
