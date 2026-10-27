import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { forgetAccountStatus } from "@/lib/account-status";
import { getDb, schema } from "@/lib/db";

const bodySchema = z.object({
  isPartner: z.boolean().optional(),
  showOnWebsite: z.boolean().optional(),
  isActive: z.boolean().optional(),
  logoUrl: z.string().trim().url().max(500).nullable().optional(),
  emailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(10).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the details" }, { status: 400 });
  const { id } = await ctx.params;
  const db = getDb();
  const [row] = await db.update(schema.colleges).set(parsed.data).where(eq(schema.colleges.id, id)).returning({ id: schema.colleges.id });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.isActive !== undefined) {
    // Switching a college off signs its officers out within the status cache window.
    const admins = await db.select({ id: schema.collegeAdmins.id }).from(schema.collegeAdmins).where(eq(schema.collegeAdmins.collegeId, id));
    for (const a of admins) forgetAccountStatus("college", a.id);
  }
  return NextResponse.json({ ok: true });
}
