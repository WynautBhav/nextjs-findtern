import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { storedFromDraft } from "@/lib/onboarding";

// Skill names only. An older client may still send {name, rating}; the rating
// is dropped, because every skill is stored at the default level.
const bodySchema = z.object({
  skills: z.array(z.union([z.string().trim().min(1), z.object({ name: z.string().trim().min(1) })])).min(4).max(7),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Skills must be 4-7" }, { status: 400 });

  const db = getDb();
  const [row] = await db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // storedFromDraft stores each name at the default level, whatever was sent.
  const { skills } = storedFromDraft({ skills: parsed.data.skills.map((s) => (typeof s === "string" ? s : s.name)) }, row);
  await db.update(schema.internOnboarding).set({ skills }).where(eq(schema.internOnboarding.id, row.id));
  await recordAdminAudit(db, { adminId: guard.session.uid, action: "intern.skills_update", targetType: "intern", targetId: id, meta: { skills: parsed.data.skills.map((s) => (typeof s === "string" ? s : s.name)) } });
  return NextResponse.json({ ok: true });
}
