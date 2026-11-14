import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { hasCodeVerifiedMembership } from "@/lib/college/membership";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { decideAccountType, getAccountType } from "@/lib/intern-account";
import { isInternPaid } from "@/lib/payments";

const bodySchema = z.object({ type: z.enum(["individual", "college"]) }).strict();

/**
 * Switch between an individual and a college account. "individual" is always allowed; "college" only while a
 * college code backs the membership (it is never granted on the client's say-so) and the fee is unpaid.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose individual or college." }, { status: 400 });

  const db = getDb();
  const [row] = await db.select({ extraData: schema.internOnboarding.extraData }).from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, uid)).limit(1);
  if (!row) return NextResponse.json({ error: "Start your profile first." }, { status: 409 });
  const current = getAccountType(row.extraData);
  const decision = decideAccountType({
    requested: parsed.data.type,
    current,
    codeVerified: await hasCodeVerifiedMembership(uid),
    paid: await isInternPaid(uid),
  });
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 403 });
  await db
    .update(schema.internOnboarding)
    .set({ extraData: sql`coalesce(${schema.internOnboarding.extraData}, '{}'::jsonb) || jsonb_build_object('accountType', ${decision.type}::text)` })
    .where(eq(schema.internOnboarding.userId, uid));
  // Only the type changes: the college link, the consent, any paid row and the unlock are not touched here.
  if (decision.type !== current) {
    await recordAdminAudit(db, { adminId: uid, action: "account_type.switch", targetType: "intern", targetId: uid, meta: { from: current ?? "none", to: decision.type } }).catch((e) => console.error("[intern/account-type] audit", e));
  }
  return NextResponse.json({ accountType: decision.type });
}
