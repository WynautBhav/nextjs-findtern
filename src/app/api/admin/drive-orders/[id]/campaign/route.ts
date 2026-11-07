import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb } from "@/lib/db";
import { withPgTransaction } from "@/lib/db/pg-tx";
import { requireMutation } from "@/lib/guards-mutation";
import { buildOutboxRows, insertRows, redactError } from "@/lib/outbox";
import { maskEmail, planRecipients, shapeCounts } from "@/lib/outbox/run";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

/** Queue a drive-code email for every roster entry with an issued code and no queued or sent mail. Safe to repeat. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const orderId = (await ctx.params).id;
  try {
    const out = await withPgTransaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`campaign:${orderId}`]);
      const o = await c.query("SELECT status FROM college_drive_orders WHERE id = $1", [orderId]);
      if (!o.rows[0]) return { status: 404 as const, error: "Not found" };
      if (o.rows[0].status !== "paid") return { status: 409 as const, error: "Record the payment before emailing codes." };
      const ents = await c.query(
        `SELECT e.id AS entry_id, e.college_email_norm AS email, dc.id AS code_id, dc.status AS code_status
           FROM drive_roster_entries e LEFT JOIN drive_codes dc ON dc.entry_id = e.id
          WHERE e.order_id = $1 ORDER BY e.row_no`,
        [orderId],
      );
      const ex = await c.query(
        `SELECT ob.entry_id, ob.status FROM email_outbox ob JOIN email_campaigns ca ON ca.id::text = ob.campaign_id
          WHERE ca.order_id = $1 AND ca.kind = 'drive_code'`,
        [orderId],
      );
      const plan = planRecipients(
        ents.rows.map((r) => ({ entryId: String(r.entry_id), email: String(r.email), codeId: (r.code_id as string | null) ?? null, codeStatus: (r.code_status as string | null) ?? null })),
        ex.rows.map((r) => ({ entryId: String(r.entry_id), status: String(r.status) })),
      );
      if (plan.length === 0) return { status: 200 as const, campaignId: null, queued: 0 };
      const camp = await c.query(
        "INSERT INTO email_campaigns (order_id, kind, created_by, status) VALUES ($1,'drive_code',$2,'running') RETURNING id",
        [orderId, g.session.uid],
      );
      const campaignId = String(camp.rows[0].id);
      const rows = buildOutboxRows(campaignId, plan.map((p) => ({ entryId: p.entryId, toEmail: p.toEmail, template: "drive_code", payload: { codeId: p.codeId, orderId } })));
      const queued = await insertRows({ query: async <T,>(t: string, p?: unknown[]) => (await c.query(t, p)).rows as T[] }, rows);
      return { status: 200 as const, campaignId, queued };
    });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
    if (out.queued > 0) await recordAdminAudit(getDb(), { adminId: g.session.uid, action: "campaign.send", targetType: "drive_order", targetId: orderId, meta: { orderId, campaignId: out.campaignId, recipients: out.queued } });
    return NextResponse.json({ ok: true, campaignId: out.campaignId, queued: out.queued });
  } catch (e) {
    console.error("[drive-campaign]", redactError(e));
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

/** Progress counts and a paged recipient list (masked emails, redacted errors). */
export async function GET(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const orderId = (await ctx.params).id;
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25));
  const pool = getDb().$client;
  const base = `FROM email_outbox ob JOIN email_campaigns ca ON ca.id::text = ob.campaign_id WHERE ca.order_id = $1 AND ca.kind = 'drive_code'
    AND ob.idempotency_key = (SELECT ob2.idempotency_key FROM email_outbox ob2 WHERE ob2.campaign_id = ob.campaign_id AND ob2.entry_id = ob.entry_id ORDER BY ob2.created_at DESC, ob2.idempotency_key DESC LIMIT 1)`;
  const [ents, ex] = await Promise.all([
    pool.query(`SELECT e.id AS entry_id, e.college_email_norm AS email, dc.id AS code_id, dc.status AS code_status FROM drive_roster_entries e LEFT JOIN drive_codes dc ON dc.entry_id = e.id WHERE e.order_id = $1`, [orderId]),
    pool.query(`SELECT ob.entry_id, ob.status FROM email_outbox ob JOIN email_campaigns ca ON ca.id::text = ob.campaign_id WHERE ca.order_id = $1 AND ca.kind = 'drive_code'`, [orderId]),
  ]);
  const eligible = planRecipients(
    ents.rows.map((r) => ({ entryId: String(r.entry_id), email: String(r.email), codeId: (r.code_id as string | null) ?? null, codeStatus: (r.code_status as string | null) ?? null })),
    ex.rows.map((r) => ({ entryId: String(r.entry_id), status: String(r.status) })),
  ).length;
  const [counts, list] = await Promise.all([
    pool.query(`SELECT ob.status, count(*)::int AS n ${base} GROUP BY ob.status`, [orderId]),
    pool.query(`SELECT ob.id, ob.to_email, ob.status, ob.attempts, ob.last_error, ob.sent_at ${base} ORDER BY ob.created_at DESC, ob.id LIMIT $2 OFFSET $3`, [orderId, size, (page - 1) * size]),
  ]);
  const counted = shapeCounts(counts.rows);
  return NextResponse.json({
    counts: counted,
    eligible,
    page,
    pageSize: size,
    recipients: list.rows.map((r) => ({
      id: String(r.id), email: maskEmail(String(r.to_email)), status: String(r.status), attempts: Number(r.attempts),
      lastError: r.last_error ? redactError(r.last_error) : null, sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    })),
  });
}
