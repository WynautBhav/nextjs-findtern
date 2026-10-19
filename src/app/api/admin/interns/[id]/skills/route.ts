import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { readSkillRatings, storedFromDraft } from "@/lib/onboarding";

const LEVEL = z.enum(["Beginner", "Intermediate", "Advanced"]);
// Names alone keep each skill's current level; {name, rating} lets the admin
// set the level, as the legacy admin could.
const bodySchema = z.object({
  skills: z.array(z.union([z.string().trim().min(1), z.object({ name: z.string().trim().min(1), rating: LEVEL })])).min(4).max(7),
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

  // A given level wins; otherwise keep the existing one; new skills start at Beginner.
  const prev = new Map(readSkillRatings(row.skills, row.extraData ?? {}).map((s) => [s.name.toLowerCase(), s.rating]));
  const { skills } = storedFromDraft(
    {
      skillsWithRatings: parsed.data.skills.map((s) =>
        typeof s === "string" ? { name: s, rating: prev.get(s.toLowerCase()) ?? "Beginner" } : s,
      ),
    },
    row,
  );
  await db.update(schema.internOnboarding).set({ skills }).where(eq(schema.internOnboarding.id, row.id));
  return NextResponse.json({ ok: true });
}
