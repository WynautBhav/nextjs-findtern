import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { MAX_FEE_MINOR } from "@/lib/college/drive-order";
import { getDb } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { getSetting, setSetting } from "@/lib/platform-settings";
import { CACHE_TAGS, purgeServerCache } from "@/lib/server-cache";

const bodySchema = z.object({ feePerStudentMinor: z.number().int().min(100).max(MAX_FEE_MINOR) }).strict();

/**
 * The campus drive fee per student that a NEW drive order starts from (₹800 until an admin changes it).
 * It is a default only: each order still stores its own fee, so changing this never reprices an order already made.
 */
export async function PUT(req: Request) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the fee in rupees, ₹1 or more." }, { status: 400 });
  const before = await getSetting("college_fee_per_student_minor");
  await setSetting("college_fee_per_student_minor", parsed.data.feePerStudentMinor, g.session.uid);
  purgeServerCache(CACHE_TAGS.settings);
  await recordAdminAudit(getDb(), { adminId: g.session.uid, action: "college.fee_default", targetType: "setting", targetId: "college_fee_per_student_minor", meta: { from: Number(before), to: parsed.data.feePerStudentMinor } });
  return NextResponse.json({ ok: true, feePerStudentMinor: parsed.data.feePerStudentMinor });
}
