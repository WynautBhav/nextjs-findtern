import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb } from "@/lib/db";
import { withPgTransaction } from "@/lib/db/pg-tx";
import { requireMutation } from "@/lib/guards-mutation";
import { redactError, resend } from "@/lib/outbox";
import { canResend } from "@/lib/outbox/run";

type Ctx = { params: Promise<{ id: string; outboxId: string }> };

/** Queue another copy of one drive-code email under the next resend number. The original row is untouched. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const { id: orderId, outboxId } = await ctx.params;
  try {
    const out = await withPgTransaction(async (c) => {
      const q = async <T,>(t: string, p?: unknown[]) => (await c.query(t, p)).rows as T[];
      const cur = await q<{ campaign_id: string; entry_id: string; status: string }>(
        `SELECT ob.campaign_id, ob.entry_id, ob.status FROM email_outbox ob JOIN email_campaigns ca ON ca.id::text = ob.campaign_id
          WHERE ob.id = $1 AND ca.order_id = $2 FOR UPDATE OF ob`,
        [outboxId, orderId],
      );
      if (!cur[0]) return { status: 404 as const, error: "Not found" };
      const sib = await q<{ status: string }>("SELECT status FROM email_outbox WHERE campaign_id = $1 AND entry_id = $2 AND id <> $3", [cur[0].campaign_id, cur[0].entry_id, outboxId]);
      const ok = canResend(cur[0], sib);
      if (!ok.ok) return { status: 409 as const, error: ok.reason };
      const newId = await resend({ query: q }, outboxId);
      return newId ? { status: 200 as const, newId } : { status: 409 as const, error: "A resend is already queued." };
    });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
    await recordAdminAudit(getDb(), { adminId: g.session.uid, action: "campaign.resend", targetType: "drive_order", targetId: orderId, meta: { orderId, outboxId, newOutboxId: out.newId } });
    return NextResponse.json({ ok: true, id: out.newId });
  } catch (e) {
    console.error("[drive-resend]", redactError(e));
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
