import { NextResponse } from "next/server";
import { z } from "zod";

import { allows } from "@/lib/admin/permissions";
import { openRefund } from "@/lib/college/refund";
import { requireMutation } from "@/lib/guards-mutation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ internPaymentId: z.string().trim().min(1, "Pick a payment").max(64) });

/** Opens the refund for a paid activation (idempotent: an open refund is returned as is). */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  if (!allows(guard.session.permissions, ["transactions:write"])) return NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const result = await openRefund(parsed.data.internPaymentId, guard.session.uid);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { created, ...value } = result.value;
  return NextResponse.json({ ...value, reviewReason: value.reviewReason ?? undefined }, { status: created ? 201 : 200 });
}
