import { getDb } from "@/lib/db";
import { notify } from "@/lib/notify";
import { SITE_URL } from "@/lib/seo";

import { queueCodeEmails } from "./campaign";

/**
 * After the team confirms a sheet: tell every student the sheet was matched to an account that their college
 * paid (they accept in the app, no code), and email a code to everyone else. Best-effort, never throws: a mail
 * or notification failure must not undo a confirmed import, and a repeat is safe (deduped per order and student).
 */
export async function announceConfirmed(importId: string, adminId: string): Promise<{ notified: number; codesQueued: number }> {
  let notified = 0;
  let codesQueued = 0;
  try {
    const r = await getDb().$client.query(
      `SELECT DISTINCT e.intern_id, e.order_id, c.name AS college_name
         FROM drive_roster_entries e
         JOIN drive_codes k ON k.entry_id = e.id AND k.status = 'issued'
         JOIN college_drive_orders o ON o.id = e.order_id
         JOIN colleges c ON c.id = o.college_id
        WHERE e.import_id = $1 AND e.state = 'valid' AND e.intern_id IS NOT NULL`,
      [importId],
    );
    for (const row of r.rows) {
      const college = String(row.college_name);
      const title = `${college} has paid your Findtern fee`;
      const message = "Open your dashboard and accept it to activate your profile. You do not need a code.";
      const sent = await notify({
        to: { type: "intern", id: String(row.intern_id) },
        type: "drive_fee_covered",
        title,
        message,
        data: { url: "/intern/dashboard" },
        dedupeKey: `drive-claim:${row.order_id}:${row.intern_id}`,
        email: { subject: title, heading: title, greeting: "Hi,", lines: [message], cta: { label: "Open Findtern", url: `${SITE_URL}/intern/dashboard` } },
      }).catch((e) => (console.error("[drive-announce] notify", e), false));
      if (sent) notified += 1;
    }
  } catch (e) {
    console.error("[drive-announce] notifying matched students failed", e);
  }
  try {
    const order = await getDb().$client.query("SELECT order_id FROM drive_imports WHERE id = $1", [importId]);
    const q = order.rows[0] ? await queueCodeEmails(String(order.rows[0].order_id), adminId, { skipMatched: true }) : null;
    if (q && "queued" in q) codesQueued = q.queued ?? 0;
  } catch (e) {
    console.error("[drive-announce] queueing code emails failed", e);
  }
  return { notified, codesQueued };
}
