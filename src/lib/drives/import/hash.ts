import { createHash } from "node:crypto";

export function fileSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Idempotency key for one row of one file. */
export function rowKey(sha256: string, rowNo: number): string {
  return `${sha256}:${rowNo}`;
}
