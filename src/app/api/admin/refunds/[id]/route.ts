import { NextResponse } from "next/server";
import { z } from "zod";

import { allows } from "@/lib/admin/permissions";
import { cancelRefund, initiateRefund, markManualRefund, refreshRefund, rejectRefund } from "@/lib/college/refund";
import { requireMutation } from "@/lib/guards-mutation";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("initiate"), confirmAmountMinor: z.number("Confirm the amount").int().positive() }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("mark_manual"), reference: z.string().trim().min(3, "Enter the refund reference (at least 3 characters)").max(200) }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3, "Say why (at least 3 characters)").max(500) }),
  z.object({ action: z.literal("cancel") }),
], { error: "Unknown action" });

/** One refund's actions: initiate (Razorpay), refresh, mark_manual, reject, cancel. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  if (!allows(guard.session.permissions, ["transactions:write"])) return NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const adminId = guard.session.uid;
  const b = parsed.data;
  const result =
    b.action === "initiate" ? await initiateRefund(id, adminId, b.confirmAmountMinor)
    : b.action === "refresh" ? await refreshRefund(id, adminId)
    : b.action === "mark_manual" ? await markManualRefund(id, adminId, b.reference)
    : b.action === "reject" ? await rejectRefund(id, adminId, b.reason)
    : await cancelRefund(id, adminId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.value);
}
