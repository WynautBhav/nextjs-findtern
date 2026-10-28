import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { identityValue, REVEAL_FIELDS } from "@/lib/admin/identity-mask";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({ field: z.enum(REVEAL_FIELDS) });

/**
 * Reveal one of a candidate's identity numbers (Aadhaar, PAN, bank account)
 * in full, for a staff member making a payment or checking a document
 * (QA-003). The page only ever receives the last four; every reveal is
 * written to the audit log before the value is returned. POST, so it goes
 * through the mutation guard and `interns:write`, not a cacheable GET.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { field } = parsed.data;

  const db = getDb();
  const [row] = await db
    .select({
      aadhaarNumber: schema.internOnboarding.aadhaarNumber,
      panNumber: schema.internOnboarding.panNumber,
      extraData: schema.internOnboarding.extraData,
    })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, id))
    .limit(1);
  const value = identityValue(row, field);
  if (!value) return NextResponse.json({ error: "Nothing on file" }, { status: 404 });

  await db.insert(schema.adminAuditLog).values({
    adminId: guard.session.uid,
    action: "identity.reveal",
    targetType: "intern",
    targetId: id,
    meta: { field },
  });
  return NextResponse.json({ value }, { headers: { "Cache-Control": "no-store, private, max-age=0" } });
}
