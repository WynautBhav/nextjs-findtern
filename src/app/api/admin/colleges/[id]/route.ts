import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { diffFields, recordAdminAudit } from "@/lib/admin/audit";
import { requireMutation } from "@/lib/guards-mutation";
import { forgetAccountStatus } from "@/lib/account-status";
import { GSTIN_FORMAT, GSTIN_HINT } from "@/lib/gstin";
import { gstinStateError } from "@/lib/gst";
import { isSafeLink } from "@/lib/safe-url";
import { isUniqueViolation } from "@/lib/promo";
import { getDb, schema } from "@/lib/db";

const bodySchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  city: z.string().trim().max(80).nullable().optional(),
  aisheCode: z.string().trim().regex(/^[CUS]-\d{3,6}$/i, "AISHE codes look like U-0657 or C-12345").nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_FORMAT, GSTIN_HINT).nullable().optional(),
  isPartner: z.boolean().optional(),
  showOnWebsite: z.boolean().optional(),
  isActive: z.boolean().optional(),
  logoUrl: z.string().trim().url().max(500).refine((u) => isSafeLink(u), "Logo link must start with http:// or https://").nullable().optional(),
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
  const set = { ...parsed.data, ...(parsed.data.state !== undefined ? { state: parsed.data.state || null } : {}), ...(parsed.data.aisheCode !== undefined ? { aisheCode: parsed.data.aisheCode?.toUpperCase() || null } : {}), ...(parsed.data.city !== undefined ? { city: parsed.data.city || null } : {}) };
  const [before] = await db
    .select({
      name: schema.colleges.name,
      city: schema.colleges.city,
      state: schema.colleges.state,
      gstin: schema.colleges.gstin,
      aisheCode: schema.colleges.aisheCode,
      isPartner: schema.colleges.isPartner,
      showOnWebsite: schema.colleges.showOnWebsite,
      isActive: schema.colleges.isActive,
      logoUrl: schema.colleges.logoUrl,
      emailDomains: schema.colleges.emailDomains,
    })
    .from(schema.colleges)
    .where(eq(schema.colleges.id, id))
    .limit(1);
  // The GSTIN's state digits pick CGST+SGST vs IGST on the invoice, so they must agree with the state (checked against what the row will hold).
  if (before && (parsed.data.state !== undefined || parsed.data.gstin !== undefined)) {
    const problem = gstinStateError(parsed.data.gstin !== undefined ? parsed.data.gstin : before.gstin, parsed.data.state !== undefined ? parsed.data.state : before.state);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
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
  const { isPartner, state, gstin, ...rest } = parsed.data;
  const was: Record<string, unknown> = before ?? {};
  if (Object.keys(rest).length) await recordAdminAudit(db, { adminId: guard.session.uid, action: "college.update", targetType: "college", targetId: id, meta: { changes: diffFields(was, Object.fromEntries(Object.entries(set).filter(([k]) => k !== "isPartner" && k !== "state" && k !== "gstin"))) } });
  if (state !== undefined || gstin !== undefined) await recordAdminAudit(db, { adminId: guard.session.uid, action: "college.billing_update", targetType: "college", targetId: id, meta: { changes: diffFields(was, Object.fromEntries(Object.entries(set).filter(([k]) => k === "state" || k === "gstin"))) } });
  if (isPartner !== undefined) await recordAdminAudit(db, { adminId: guard.session.uid, action: "college.partner_toggle", targetType: "college", targetId: id, meta: { isPartner: { from: was.isPartner ?? null, to: isPartner } } });
  return NextResponse.json({ ok: true });
}
