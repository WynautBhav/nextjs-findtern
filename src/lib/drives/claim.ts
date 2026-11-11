import { deriveDriveCode } from "./code-derive.ts";

type Query = { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/**
 * The student's own unused code, found by who the sheet was matched to, never by anything they type. Lets a
 * matched student accept what their college paid without a code. Null when there is nothing to accept.
 */
export async function pendingClaimFor(db: Query, internId: string, secret: string): Promise<{ code: string; collegeName: string } | null> {
  const r = await db.query(
    `SELECT k.id AS code_id, c.name AS college_name
       FROM drive_roster_entries e
       JOIN drive_codes k ON k.entry_id = e.id AND k.status = 'issued' AND k.valid_until > now()
       JOIN college_drive_orders o ON o.id = e.order_id AND o.status = 'paid'
       JOIN colleges c ON c.id = o.college_id
      WHERE e.intern_id = $1
      ORDER BY k.created_at LIMIT 1`,
    [internId],
  );
  const row = r.rows[0];
  return row ? { code: deriveDriveCode(String(row.code_id), secret), collegeName: String(row.college_name) } : null;
}
