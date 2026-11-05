import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { diffFields, recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { DUPLICATE_CODE, isUniqueViolation } from "@/lib/promo";
import { collegeCodeDeleteProblem, collegeCodeEditProblem, PROMO_APPLIES_TO, promoWindowProblem } from "@/lib/promo-rules";

// Omitted = leave as is; null = clear.
const bodySchema = z.object({
  code: z.string().trim().min(2, "Code must be at least 2 characters").optional(),
  description: z.string().nullish(),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  discountValue: z.number("Enter a discount value").int("Discount must be a whole number").positive("Discount must be greater than 0").optional(),
  maxUsages: z.number().int().positive("Max uses must be at least 1").nullish(),
  minOrderAmountMinor: z.number().int().min(0, "Minimum order can't be negative").nullish(),
  validFrom: z.string().datetime().nullish(),
  validUntil: z.string().datetime().nullish(),
  isActive: z.boolean().optional(),
  appliesTo: z.enum(PROMO_APPLIES_TO).optional(),
})
  .refine((b) => b.discountType !== "percentage" || b.discountValue === undefined || b.discountValue <= 100, {
    message: "A percentage discount can't be more than 100",
  })
  // Employer codes may not cover the stipend (C1); fixed amounts are checked at quote time, when the stipend is known.
  .refine((b) => b.discountType !== "percentage" || b.discountValue !== 100 || b.appliesTo === "intern" || b.appliesTo === undefined, {
    message: "Only an intern code can be 100%. Employer codes can't cover the whole stipend.",
  });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const db = getDb();
  const code = parsed.data.code?.toUpperCase();
  if (code) {
    const [clash] = await db
      .select({ id: schema.promoCodes.id })
      .from(schema.promoCodes)
      .where(and(eq(schema.promoCodes.code, code), ne(schema.promoCodes.id, id)))
      .limit(1);
    if (clash) return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
  }

  const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
  // The window is checked against whatever the row will hold after the edit.
  const [existing] = await db
    .select({
      validFrom: schema.promoCodes.validFrom,
      validUntil: schema.promoCodes.validUntil,
      code: schema.promoCodes.code,
      collegeId: schema.promoCodes.collegeId,
      discountType: schema.promoCodes.discountType,
      discountValue: schema.promoCodes.discountValue,
      appliesTo: schema.promoCodes.appliesTo,
      maxUsages: schema.promoCodes.maxUsages,
      description: schema.promoCodes.description,
      minOrderAmountMinor: schema.promoCodes.minOrderAmountMinor,
      isActive: schema.promoCodes.isActive,
    })
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // A college's code keeps its discount, audience and cap; those change on the college screen.
  const locked = collegeCodeEditProblem(existing, parsed.data);
  if (locked) return NextResponse.json({ error: locked }, { status: 403 });
  const nextFrom = toDate(parsed.data.validFrom);
  const nextUntil = toDate(parsed.data.validUntil);
  const window = promoWindowProblem(
    nextFrom === undefined ? existing.validFrom : nextFrom,
    nextUntil === undefined ? existing.validUntil : nextUntil,
  );
  if (window) return NextResponse.json({ error: window }, { status: 400 });
  const next = {
    ...parsed.data,
    code,
    validFrom: toDate(parsed.data.validFrom),
    validUntil: toDate(parsed.data.validUntil),
  };
  try {
    await db.update(schema.promoCodes).set({ ...next, updatedAt: new Date() }).where(eq(schema.promoCodes.id, id));
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    throw e;
  }
  await recordAdminAudit(db, { adminId: guard.session.uid, action: "promo.update", targetType: "promo_code", targetId: id, meta: { code: existing.code, discountType: next.discountType ?? existing.discountType, changes: diffFields(existing, next) } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const [row] = await db.select({ collegeId: schema.promoCodes.collegeId, code: schema.promoCodes.code }).from(schema.promoCodes).where(eq(schema.promoCodes.id, id)).limit(1);
  const locked = collegeCodeDeleteProblem(row?.collegeId);
  if (locked) return NextResponse.json({ error: locked }, { status: 403 });
  await db.delete(schema.promoCodes).where(eq(schema.promoCodes.id, id));
  await recordAdminAudit(db, { adminId: guard.session.uid, action: "promo.delete", targetType: "promo_code", targetId: id, meta: { code: row?.code ?? null } });
  return NextResponse.json({ ok: true });
}
