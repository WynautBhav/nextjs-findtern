import { randomUUID } from "node:crypto";

import { deriveDriveCode, hashDriveCode } from "./code-derive.ts";

export type DriveCodeRow = {
  id: string;
  orderId: string;
  entryId: string;
  codeHash: string;
  codeLast4: string;
  status: "issued";
  validUntil: Date;
};

/** Plain code is returned separately for the email only; it is never part of the row. */
export function buildCodeRow(input: {
  orderId: string;
  entryId: string;
  validUntil: Date;
  secret: string;
}): { row: DriveCodeRow; code: string } {
  const id = randomUUID();
  const code = deriveDriveCode(id, input.secret);
  const row: DriveCodeRow = {
    id,
    orderId: input.orderId,
    entryId: input.entryId,
    codeHash: hashDriveCode(code, input.secret),
    codeLast4: code.slice(-4),
    status: "issued",
    validUntil: input.validUntil,
  };
  return { row, code };
}

export function maskCode(last4: string): string {
  return `••••-••••-${last4}`;
}

/** Minimal executor: run one SQL statement, return affected/selected rows. */
export type SqlExecutor = {
  execute(query: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  insertDriveCodes?(rows: DriveCodeRow[]): Promise<void>;
};

export const ISSUE_COUNT_SQL =
  "UPDATE college_drive_orders SET issued_count = issued_count + $2 WHERE id = $1 AND status = 'paid' AND issued_count + $2 <= slots";

export type IssueResult =
  | { ok: true; issued: { row: DriveCodeRow; code: string }[] }
  | { ok: false; reason: "order_not_available" };

/** Must run inside one transaction; a failed result means the caller rolls back. */
export async function issueCodes(
  tx: SqlExecutor & { insertDriveCodes(rows: DriveCodeRow[]): Promise<void> },
  input: { orderId: string; entryIds: string[]; validUntil: Date; secret: string },
): Promise<IssueResult> {
  const n = input.entryIds.length;
  if (n === 0) return { ok: true, issued: [] };
  const upd = await tx.execute(ISSUE_COUNT_SQL, [input.orderId, n]);
  if (upd.rowCount === 0) return { ok: false, reason: "order_not_available" };
  const issued = input.entryIds.map((entryId) =>
    buildCodeRow({ orderId: input.orderId, entryId, validUntil: input.validUntil, secret: input.secret }),
  );
  await tx.insertDriveCodes(issued.map((i) => i.row));
  return { ok: true, issued };
}
