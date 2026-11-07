import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { getDb } from "@/lib/db";
import { recordAdminAudit } from "@/lib/admin/audit";
import { initiateRefund } from "@/lib/refunds/refunds-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  not_found: "Refund not found",
  confirm_required: "Confirmation is required",
  amount_mismatch: "Amount does not match the stored refund amount",
  bad_status: "This refund can no longer be initiated",
  no_gateway_payment: "The payment has no gateway payment id",
  gateway_error: "Razorpay refused the refund; it is marked failed and can be retried from a new scan",
  gateway_unknown: "Razorpay did not answer, so the refund may or may not have gone through. Do not retry: check the Razorpay dashboard; the webhook will settle it.",
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  // Initiating is idempotent by itself: the first call claims the row, any repeat gets 409. The key is only recorded.
  const idemKey = req.headers.get("idempotency-key")?.slice(0, 100) ?? null;
  const body = (await req.json().catch(() => null)) as { confirm?: unknown; amountMinor?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    const result = await initiateRefund({ refundId: id, confirm: body.confirm, amountMinor: body.amountMinor });
    const audit = (outcome: string) =>
      recordAdminAudit(getDb(), {
        adminId: guard.session.uid, action: "refund.initiate", targetType: "payment_refunds", targetId: id,
        meta: { refundId: id, amountMinor: body.amountMinor, idempotencyKey: idemKey, outcome },
      }).catch((e) => console.error("[admin/refunds] audit write failed after initiate", id, e)); // the refund already happened; do not hide it
    if (!result.ok) {
      if (result.reason === "gateway_error" || result.reason === "gateway_unknown") await audit(result.reason);
      return NextResponse.json({ error: MESSAGES[result.reason] ?? "Refund refused", reason: result.reason }, { status: result.httpStatus });
    }
    await audit("initiated");
    return NextResponse.json({ ok: true, gatewayRefundId: result.gatewayRefundId });
  } catch (error) {
    console.error("[admin/refunds] initiate failed", error);
    return NextResponse.json({ error: "Could not initiate the refund" }, { status: 500 });
  }
}
