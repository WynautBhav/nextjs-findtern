import { withPgTransaction } from "@/lib/db/pg-tx";
import { buildOutboxRows, insertRows } from "@/lib/outbox";
import { planRecipients } from "@/lib/outbox/run";

/** Queue a drive-code email for every roster entry with an issued code and no queued or sent mail. Safe to repeat. `skipMatched` leaves out students already tied to an account (they accept in the app instead). */
export async function queueCodeEmails(orderId: string, adminId: string, opts: { skipMatched?: boolean } = {}) {
  return withPgTransaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`campaign:${orderId}`]);
    const o = await c.query("SELECT status FROM college_drive_orders WHERE id = $1", [orderId]);
    if (!o.rows[0]) return { status: 404 as const, error: "Not found" };
    if (o.rows[0].status !== "paid") return { status: 409 as const, error: "Record the payment before emailing codes." };
    const ents = await c.query(
      `SELECT e.id AS entry_id, e.college_email_norm AS email, e.intern_id AS intern_id, dc.id AS code_id, dc.status AS code_status
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
      ents.rows.filter((r) => !(opts.skipMatched && r.intern_id)).map((r) => ({ entryId: String(r.entry_id), email: String(r.email), codeId: (r.code_id as string | null) ?? null, codeStatus: (r.code_status as string | null) ?? null })),
      ex.rows.map((r) => ({ entryId: String(r.entry_id), status: String(r.status) })),
    );
    if (plan.length === 0) return { status: 200 as const, campaignId: null, queued: 0 };
    const camp = await c.query(
      "INSERT INTO email_campaigns (order_id, kind, created_by, status) VALUES ($1,'drive_code',$2,'running') RETURNING id",
      [orderId, adminId],
    );
    const campaignId = String(camp.rows[0].id);
    const rows = buildOutboxRows(campaignId, plan.map((p) => ({ entryId: p.entryId, toEmail: p.toEmail, template: "drive_code", payload: { codeId: p.codeId, orderId } })));
    const queued = await insertRows({ query: async <T,>(t: string, p?: unknown[]) => (await c.query(t, p)).rows as T[] }, rows);
    return { status: 200 as const, campaignId, queued };
    });
}
