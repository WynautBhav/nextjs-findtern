import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { getDb } from "@/lib/db";
import { recordAdminAudit } from "@/lib/admin/audit";
import { listRefunds, scanAndCreate } from "@/lib/refunds/refunds-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["eligible", "review", "pending", "initiated", "refunded", "failed"];

export async function GET(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  if (status && !STATUSES.includes(status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  const per = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("per") ?? "25", 10) || 25));
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const reason = url.searchParams.get("reason") ?? undefined;
  try {
    const out = await listRefunds({ status, reason, limit: per, offset: (page - 1) * per });
    return NextResponse.json({ ...out, page, per });
  } catch (error) {
    console.error("[admin/refunds] list failed", error);
    return NextResponse.json({ error: "Could not load refunds" }, { status: 500 });
  }
}

/** Scan: creates refund rows for students whose paid fee preceded a drive entitlement. Idempotent. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  try {
    const out = await scanAndCreate(guard.session.uid);
    await recordAdminAudit(getDb(), { adminId: guard.session.uid, action: "refund.create", targetType: "payment_refunds", meta: out });
    return NextResponse.json(out);
  } catch (error) {
    console.error("[admin/refunds] scan failed", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
