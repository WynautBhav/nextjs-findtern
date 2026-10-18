import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/** Legacy key and values (admin-interns.tsx): extraData.approvalStatus. */
const bodySchema = z.object({ approvalStatus: z.enum(["Pending", "Approved", "Rejected"]) });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [row] = await db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const extra = (row.extraData as Record<string, unknown>) ?? {};
  await db.update(schema.internOnboarding).set({ extraData: { ...extra, approvalStatus: parsed.data.approvalStatus } }).where(eq(schema.internOnboarding.id, row.id));
  return NextResponse.json({ ok: true });
}
