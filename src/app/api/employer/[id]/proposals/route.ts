import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  internId: z.string().min(1),
  projectId: z.string().min(1),
  flowType: z.enum(["direct", "interview_first"]).default("direct"),
  currency: z.string().default("INR"),
  offerDetails: z.record(z.string(), z.unknown()).default({}),
  skills: z.array(z.string()).default([]),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [proposal] = await db
    .insert(schema.proposals)
    .values({ employerId: id, ...parsed.data, status: "sent" })
    .returning();
  return NextResponse.json({ proposal }, { status: 201 });
}
