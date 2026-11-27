import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { isFullWaiver, waiverRowProblem } from "@/lib/full-waiver";
import { chargePromoMiss, chargeWaiverRedeem, promoBlockedMessage, promoGuessBlock, waiverBlockedMessage, waiverRedeemBlock } from "@/lib/promo-throttle";
import { clientIp } from "@/lib/security/rate-limit";
import { INVALID_PROMO, collegeCodeMemberProblem, collegeCodeRetiredProblem, collegeCodeProblem, employerPromoTooLarge, promoAudienceProblem, promoDiscount, promoHoldProblem, PROMO_HOLD_MINUTES, promoProblem, seatFreeWhere, type PromoAudience } from "@/lib/promo-rules";

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
  if (input.code.includes("\u0000")) return INVALID_PROMO;
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.promoCodes)
    .where(sql`upper(${schema.promoCodes.code}) = ${input.code.trim().toUpperCase()}`)
    .limit(1);
  if (!row || !row.isActive) return INVALID_PROMO;

  const audience = input.audience ?? (await audienceOf(input.subjectId));
  const scopeProblem = promoAudienceProblem(row.appliesTo, audience);
  if (scopeProblem) return { ok: false, error: scopeProblem, status: 400 };

  const retired = collegeCodeRetiredProblem(row.collegeId, audience);
  if (retired) return { ok: false, error: retired, status: 400 };

  // A full waiver is the one code that takes the hiring fee too: the whole order is discountable.
  const waiver = isFullWaiver(row);
  const discountableMinor = waiver ? input.orderMinor : input.orderMinor - (input.undiscountableMinor ?? 0);
  if (discountableMinor <= 0) return waiver ? INVALID_PROMO : { ok: false, error: "Promo codes don't apply to the hiring fee", status: 400 };
  // A waiver row with no cap or no expiry (made by hand in SQL) is dead.
  const deadWaiver = waiverRowProblem(row);
  if (deadWaiver) return { ok: false, error: deadWaiver, status: 422 };

  if (row.collegeId) {
    const [college] = await db.select({ isActive: schema.colleges.isActive, isPartner: schema.colleges.isPartner }).from(schema.colleges).where(eq(schema.colleges.id, row.collegeId)).limit(1);
    const dead = collegeCodeProblem(college ?? null);
    if (dead) return { ok: false, error: dead, status: 400 };
    if (audience === "intern") {
      const [mine] = await db
        .select({ collegeId: schema.collegeMemberships.collegeId })
        .from(schema.collegeMemberships)
        .where(and(eq(schema.collegeMemberships.userId, input.subjectId), isNull(schema.collegeMemberships.leftAt)))
        .limit(1);
      const other = collegeCodeMemberProblem(mine?.collegeId, row.collegeId);
      if (other) return { ok: false, error: other, status: 400 };
    }
  }

  const problem = promoProblem(row, discountableMinor, input.currency);
  if (problem) return { ok: false, error: problem, status: 400 };

  const [priorUse] = await db
    .select({ id: schema.promoCodeUsages.id })
    .from(schema.promoCodeUsages)
    .where(and(eq(schema.promoCodeUsages.promoCodeId, row.id), eq(schema.promoCodeUsages.userId, input.subjectId)))
    .limit(1);
  if (priorUse && !row.reusable) return { ok: false, error: "You have already used this code", status: 400 };

  const discountMinor = promoDiscount(row, discountableMinor, input.currency);
  if (audience === "employer" && !waiver && employerPromoTooLarge(discountMinor, discountableMinor)) {
    return { ok: false, error: "This code can't be used on a hire. A code can't cover the whole monthly charge.", status: 400 };
  }
  // A subscription code that would take the whole price is refused: free access is what a full-waiver code is for.
  if (audience === "subscription" && !waiver && employerPromoTooLarge(discountMinor, discountableMinor)) {
    return { ok: false, error: "This code can't cover the whole subscription price. Ask Findtern for a full-waiver code.", status: 400 };
  }
  return { ok: true, promo: row, discountMinor, payableMinor: input.orderMinor - discountMinor };
}

export type GuardedQuote = PromoQuote | { ok: false; error: string; status: 429; retryAfterSeconds: number };

/** `quotePromo` behind the brute-force budget: a blocked account is refused before the code is looked at, a refused code is charged. */
export async function quotePromoGuarded(req: Request, uid: string, input: Parameters<typeof quotePromo>[0], opts: { redeem?: boolean } = {}): Promise<GuardedQuote> {
  const who = { uid, ip: clientIp(req.headers) };
  const block = promoGuessBlock(who);
  if (block.blocked) return { ok: false, error: promoBlockedMessage(block.retryAfterSeconds), status: 429, retryAfterSeconds: block.retryAfterSeconds };
  const quote = await quotePromo(input);
  if (!quote.ok) chargePromoMiss(who);
  // Redeeming a full waiver (the order route, not the preview) spends the much tighter waiver budget, valid code or not.
  else if (opts.redeem && isFullWaiver(quote.promo)) {
    const wb = waiverRedeemBlock(who);
    if (wb.blocked) return { ok: false, error: waiverBlockedMessage(wb.retryAfterSeconds), status: 429, retryAfterSeconds: wb.retryAfterSeconds };
    chargeWaiverRedeem(who);
  }
  return quote;
}

/** Is this text a full-waiver code? Reads the row only; a waiver is allowed on any pay plan, an ordinary code only upfront. */
export async function isWaiverCode(code: string): Promise<boolean> {
  if (code.includes("\u0000")) return false;
  const [row] = await getDb()
    .select({ discountType: schema.promoCodes.discountType })
    .from(schema.promoCodes)
    .where(sql`upper(${schema.promoCodes.code}) = ${code.trim().toUpperCase()}`)
    .limit(1);
  return isFullWaiver(row);
}

/** The JSON refusal for a failed quote, with Retry-After on a throttled one. */
export function promoRefusal(quote: Extract<GuardedQuote, { ok: false }>): Response {
  const retry = "retryAfterSeconds" in quote ? { "Retry-After": String(quote.retryAfterSeconds) } : undefined;
  return Response.json({ error: quote.error }, { status: quote.status, headers: retry });
}

/**
 * Run on the order-opening transaction, after the account's own pay lock: a use is consumed when an order is
 * paid, held while one is open (30 minutes, then it reads as expired) and free again when it fails or expires.
 * A capped code is refused here when its remaining uses are all held by OTHER accounts' open payments, so two
 * payments can't both be taken for the last use. Taken under a per-code lock (always after the account lock, so
 * no lock cycle) and read in ONE statement, so a payment settling in between can't be counted twice or not at all.
 */
export async function promoHoldRefusal(tx: Db | Tx, code: string, subjectId: string): Promise<string | null> {
  // UTC ISO text: the *_at columns are timestamp-without-zone holding UTC (drizzle writes toISOString), and a raw Date parameter would go in as server-local time.
  const since = new Date(Date.now() - PROMO_HOLD_MINUTES * 60_000).toISOString();
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`promo:${code.toUpperCase()}`}))`);
  const res = await tx.execute(sql`
    select p.max_usages, p.used_count, p.college_id,
      (select count(*) from employer_payments e
        where e.status = 'created' and e.created_at >= ${since}::timestamp and e.employer_id <> ${subjectId}
          and upper(e.raw -> 'promo' ->> 'promoCode') = upper(p.code))
      + (select count(*) from intern_payments i
        where i.status = 'created' and i.created_at >= ${since}::timestamp and i.intern_id <> ${subjectId}
          and upper(i.raw ->> 'promoCode') = upper(p.code)) as held
    from promo_codes p where upper(p.code) = ${code.toUpperCase()} limit 1`);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return promoHoldProblem(
    { maxUsages: row.max_usages === null ? null : Number(row.max_usages), usedCount: Number(row.used_count), collegeId: (row.college_id as string | null) ?? null },
    Number(row.held),
  );
}

/** How many unpaid orders, from any account, currently hold this code. For the delete guard. */
export async function openPromoOrders(q: Db | Tx, code: string): Promise<number> {
  // UTC ISO text: the *_at columns are timestamp-without-zone holding UTC (drizzle writes toISOString), and a raw Date parameter would go in as server-local time.
  const since = new Date(Date.now() - PROMO_HOLD_MINUTES * 60_000).toISOString();
  const res = await q.execute(sql`
    select (select count(*) from employer_payments e where e.status = 'created' and e.created_at >= ${since}::timestamp and upper(e.raw -> 'promo' ->> 'promoCode') = ${code.toUpperCase()})
         + (select count(*) from intern_payments i where i.status = 'created' and i.created_at >= ${since}::timestamp and upper(i.raw ->> 'promoCode') = ${code.toUpperCase()}) as n`);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  return Number(row?.n ?? 0);
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

/** Idempotent: a second call for the same code and account (or, for a reusable code, the same order) is a no-op. */
export async function recordPromoUse(input: {
  code: string;
  subjectId: string;
  orderId: string;
  discountMinor: number;
  /** A ₹0 order has no money to protect: refuse it when the cap is full. A paid order is never refused. */
  enforceCap?: boolean;
}, db: Db | Tx = getDb()): Promise<{ capped: boolean; collegeId: string | null; refused?: string }> {
  const [promo] = await db
    .select({ id: schema.promoCodes.id, collegeId: schema.promoCodes.collegeId, reusable: schema.promoCodes.reusable })
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
      singleUse: !promo.reusable,
    })
    .onConflictDoNothing()
    .returning({ id: schema.promoCodeUsages.id });
  if (inserted.length === 0) return { capped: false, collegeId: null };

  // A ₹0 order has nothing to protect, so an inactive college refuses it; a paid order is never refused.
  if (input.enforceCap && promo.collegeId) {
    const [college] = await db.select({ isActive: schema.colleges.isActive, isPartner: schema.colleges.isPartner }).from(schema.colleges).where(eq(schema.colleges.id, promo.collegeId)).limit(1);
    const refused = collegeCodeProblem(college ?? null);
    if (refused) return { capped: true, collegeId: promo.collegeId, refused };
  }

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
