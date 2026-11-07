import { driveCodeEmail, renderEmail } from "../emails.ts";
import { driveCodeSecret, deriveDriveCode } from "../drives/code-derive.ts";
import { sendSmtpMail } from "../mailer.ts";
import { redactError, type OutboxRow, type Sender } from "./index.ts";

type Lookup = (codeId: string) => Promise<{ name: string; collegeName: string; status: string; validUntil: Date } | null>;
type Mail = (o: { to: string; subject: string; text: string; html: string }) => Promise<{ ok: true; mode: string } | { ok: false; error: string }>;

async function dbLookup(codeId: string) {
  const { getDb } = await import("../db/index.ts");
  const r = await getDb().$client.query(
    `SELECT e.name, c.name AS college_name, dc.status, dc.valid_until
       FROM drive_codes dc
       JOIN drive_roster_entries e ON e.id = dc.entry_id
       JOIN college_drive_orders o ON o.id = dc.order_id
       JOIN colleges c ON c.id = o.college_id
      WHERE dc.id = $1`,
    [codeId],
  );
  const x = r.rows[0];
  return x ? { name: String(x.name), collegeName: String(x.college_name), status: String(x.status), validUntil: new Date(x.valid_until) } : null;
}

/** Builds the Sender. Injectable seams keep tests off the database and the mailer. */
export function makeSender(deps: { lookup?: Lookup; mail?: Mail; secret?: () => string } = {}): Sender {
  const lookup = deps.lookup ?? dbLookup;
  const mail = deps.mail ?? sendSmtpMail;
  const secret = deps.secret ?? driveCodeSecret;
  return async (row: OutboxRow) => {
    try {
      const codeId = row.payload?.codeId;
      if (row.template !== "drive_code" || typeof codeId !== "string") throw new Error("Unsupported outbox row");
      const d = await lookup(codeId);
      if (!d) throw new Error("Code not found");
      if (d.status !== "issued") throw new Error(`Code is ${d.status}; not sending`);
      if (d.validUntil.getTime() <= Date.now()) throw new Error("Code has expired; not sending");
      const msg = renderEmail(driveCodeEmail({ name: d.name, collegeName: d.collegeName, code: deriveDriveCode(codeId, secret()), validUntil: d.validUntil }));
      const res = await mail({ to: row.to_email, ...msg });
      if (!res.ok) throw new Error(res.error);
      return { providerId: `${res.mode}:${row.idempotency_key}` };
    } catch (e) {
      throw new Error(redactError(e));
    }
  };
}

export const sendDriveCodeRow: Sender = (row) => makeSender()(row);
