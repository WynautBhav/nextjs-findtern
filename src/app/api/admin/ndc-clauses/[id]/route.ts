import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { sanitizeRichText } from "@/lib/richtext";

const bodySchema = z.object({
  title: z.string().min(1).optional(),
  bodyHtml: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const values = { ...parsed.data };
  if (values.bodyHtml !== undefined) {
    values.bodyHtml = sanitizeRichText(values.bodyHtml);
    if (!values.bodyHtml.replace(/<[^>]*>/g, "").trim()) return NextResponse.json({ error: "Clause text is required" }, { status: 400 });
  }

  const db = getDb();
  await db.update(schema.internNonDisclosureClauses).set({ ...values, updatedAt: new Date() }).where(eq(schema.internNonDisclosureClauses.id, id));
  revalidatePath("/", "layout"); // the public NDA page reads these
  await recordAdminAudit(db, { adminId: guard.session.uid, action: "ndc.update", targetType: "ndc_clause", targetId: id, meta: { fields: Object.keys(values) } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  await db.delete(schema.internNonDisclosureClauses).where(eq(schema.internNonDisclosureClauses.id, id));
  revalidatePath("/", "layout"); // the public NDA page reads these
  await recordAdminAudit(db, { adminId: guard.session.uid, action: "ndc.delete", targetType: "ndc_clause", targetId: id });
  return NextResponse.json({ ok: true });
}
