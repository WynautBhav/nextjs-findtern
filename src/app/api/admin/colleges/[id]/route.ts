import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { forgetAccountStatus } from "@/lib/account-status";
import { isSafeLink } from "@/lib/safe-url";
import { isUniqueViolation } from "@/lib/promo";
import { getDb, schema } from "@/lib/db";

const bodySchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  city: z.string().trim().max(80).nullable().optional(),
  aisheCode: z.string().trim().regex(/^[CUS]-\d{3,6}$/i, "AISHE codes look like U-0657 or C-12345").nullable().optional(),
  isPartner: z.boolean().optional(),
  showOnWebsite: z.boolean().optional(),
  isActive: z.boolean().optional(),
  logoUrl: z.string().trim().url().max(500).refine((u) => isSafeLink(u), "Logo link must start with https://").nullable().optional(),
  emailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(10).optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), "Nothing to change");

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details" }, { status: 400 });
  const { id } = await ctx.params;
  const db = getDb();
  // scripts/import-colleges.ts rewrites name/city/AISHE code on non-partner rows, so edits there would be undone (or re-create the old code as a duplicate).
  if (["name", "city", "aisheCode"].some((k) => parsed.data[k as "name"] !== undefined)) {
    const [cur] = await db.select({ isPartner: schema.colleges.isPartner }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
    if (cur && !cur.isPartner && !parsed.data.isPartner) return NextResponse.json({ error: "Only partner colleges can be renamed or re-coded; the directory import owns the rest." }, { status: 409 });
  }
  // slug and Findtern code are never touched, so the college's URLs and code stay put.
  const set = { ...parsed.data, ...(parsed.data.aisheCode !== undefined ? { aisheCode: parsed.data.aisheCode?.toUpperCase() || null } : {}), ...(parsed.data.city !== undefined ? { city: parsed.data.city || null } : {}) };
  let row: { id: string } | undefined;
  try {
    [row] = await db.update(schema.colleges).set(set).where(eq(schema.colleges.id, id)).returning({ id: schema.colleges.id });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "A college with that AISHE code already exists" }, { status: 409 });
    throw e;
  }
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.isActive !== undefined) {
    // Switching a college off signs its officers out within the status cache window.
    const admins = await db.select({ id: schema.collegeAdmins.id }).from(schema.collegeAdmins).where(eq(schema.collegeAdmins.collegeId, id));
    for (const a of admins) forgetAccountStatus("college", a.id);
  }
  return NextResponse.json({ ok: true });
}
