import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { promoCodeProblem } from "@/lib/admin/promo-edit-rules";
import { getDb, schema } from "@/lib/db";
import { FULL_WAIVER_LIMITS, FULL_WAIVER_TYPE, generateWaiverCode, waiverCodeTail, waiverCreateProblem } from "@/lib/full-waiver";
import { requireMutation } from "@/lib/guards-mutation";
import { DUPLICATE_CODE, isUniqueViolation } from "@/lib/promo";

// Create a FULL WAIVER code: makes a whole payment free. Admin role, plus transactions:write (the proxy and
// requireMutation both apply the rule for this path, src/lib/admin/permissions.ts), never the cms:write that edits ordinary codes.
// Always capped: max uses 1-25 (default 1), expiry within 30 days (default 7), audience chosen. No code text is audited.
const bodySchema = z.object({
  code: z.string().trim().optional(),
  description: z.string().trim().max(200).nullish(),
  appliesTo: z.string().optional(),
  maxUsages: z.number().nullish(),
  validUntil: z.string().datetime().nullish(),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const body = parsed.data;

  // Omitted = the default; an explicit null (the form's "no limit") is a refusal, never a quiet default.
  const maxUsages = body.maxUsages === undefined ? FULL_WAIVER_LIMITS.maxUsesDefault : body.maxUsages;
  const now = new Date();
  const validUntil = body.validUntil === undefined ? new Date(now.getTime() + FULL_WAIVER_LIMITS.expiryDaysDefault * 86_400_000) : body.validUntil === null ? null : new Date(body.validUntil);
  const problem = waiverCreateProblem({ maxUsages, validUntil, appliesTo: body.appliesTo, now });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const code = (body.code || generateWaiverCode()).toUpperCase();
  const badCode = promoCodeProblem(code);
  if (badCode) return NextResponse.json({ error: badCode }, { status: 400 });

  const db = getDb();
  const [clash] = await db.select({ id: schema.promoCodes.id }).from(schema.promoCodes).where(sql`upper(${schema.promoCodes.code}) = ${code}`).limit(1);
  if (clash) return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });

  try {
    const [promo] = await db
      .insert(schema.promoCodes)
      .values({
        code,
        description: body.description || "Full waiver",
        discountType: FULL_WAIVER_TYPE,
        discountValue: 100, // unused for a waiver (promoDiscount takes the whole order); 100 keeps any old reader sane
        maxUsages,
        validUntil,
        isActive: true,
        appliesTo: body.appliesTo as "employer" | "intern" | "both",
      })
      .returning();
    await recordAdminAudit(db, {
      adminId: guard.session.uid,
      action: "promo.full_waiver_created",
      targetType: "promo_code",
      targetId: promo.id,
      meta: { codeTail: waiverCodeTail(code), appliesTo: promo.appliesTo, maxUsages: promo.maxUsages, validUntil: promo.validUntil?.toISOString() ?? null },
    });
    return NextResponse.json({ promo }, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    throw e;
  }
}
