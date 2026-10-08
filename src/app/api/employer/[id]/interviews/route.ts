import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  internId: z.string().min(1),
  projectId: z.string().optional(),
  slot1: z.string().datetime().optional(),
  slot2: z.string().datetime().optional(),
  slot3: z.string().datetime().optional(),
  timezone: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [interview] = await db
    .insert(schema.interviews)
    .values({
      employerId: id,
      internId: parsed.data.internId,
      projectId: parsed.data.projectId,
      slot1: parsed.data.slot1 ? new Date(parsed.data.slot1) : null,
      slot2: parsed.data.slot2 ? new Date(parsed.data.slot2) : null,
      slot3: parsed.data.slot3 ? new Date(parsed.data.slot3) : null,
      timezone: parsed.data.timezone,
      status: "pending",
    })
    .returning();
  return NextResponse.json({ interview }, { status: 201 });
}
