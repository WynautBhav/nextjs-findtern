import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/** Ask Findtern to approve USD full-time offers (International FTE). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [employer] = await db
    .select({ status: schema.employers.internationalFteStatus })
    .from(schema.employers)
    .where(eq(schema.employers.id, id))
    .limit(1);
  if (!employer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (employer.status === "applied" || employer.status === "approved") return NextResponse.json({ status: employer.status });

  await db
    .update(schema.employers)
    .set({ internationalFteStatus: "applied", internationalFteAppliedAt: new Date() })
    .where(eq(schema.employers.id, id));
  return NextResponse.json({ status: "applied" });
}
