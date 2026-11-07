/** Pure decisions for the admin drive-order, import and identity-review routes (no DB, no Next). */
import { isXlsx } from "../xlsx.ts";
import type { Mapping, RosterField } from "./import/headers.ts";
import type { EntryState, RosterRow } from "./import/validate.ts";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20000;
export const PREVIEW_ROWS = 1000;

/** Only csv/xlsx, decided by content, never by file name. */
export function sniffRosterFile(bytes: Uint8Array): "xlsx" | "csv" | null {
  if (bytes.length === 0) return null;
  if (isXlsx(bytes)) return "xlsx";
  if (bytes.includes(0)) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /[^\s]/.test(text) ? "csv" : null;
  } catch {
    return null;
  }
}

/** An `Idempotency-Key` header: absent is fine (null), present must be 8 to 128 safe characters. */
export function parseIdempotencyKey(raw: string | null): { ok: true; key: string | null } | { ok: false } {
  if (raw === null || raw === "") return { ok: true, key: null };
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(raw) ? { ok: true, key: raw } : { ok: false };
}

/** A client-supplied column mapping: whole, distinct, in-range column numbers, email required. */
export function validateMapping(raw: unknown, columnCount: number): { ok: true; mapping: Mapping } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Mapping must be an object" };
  const out: Mapping = {};
  const used = new Set<number>();
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k !== "name" && k !== "email" && k !== "phone") return { ok: false, error: `Unknown field ${k}` };
    if (v === null || v === undefined || v === "") continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= columnCount) return { ok: false, error: `Column for ${k} is out of range` };
    if (used.has(v)) return { ok: false, error: "A column can be used for one field only" };
    used.add(v);
    out[k as RosterField] = v;
  }
  if (out.email === undefined) return { ok: false, error: "Choose the email column" };
  if (out.name === undefined) return { ok: false, error: "Choose the name column" };
  return { ok: true, mapping: out };
}

export function sameMapping(a: Mapping, b: Mapping): boolean {
  return (["name", "email", "phone"] as RosterField[]).every((f) => (a[f] ?? null) === (b[f] ?? null));
}

export type EntryCounts = Record<EntryState, number> & { total: number };

export function countStates(rows: readonly { state: string }[]): EntryCounts {
  const c: EntryCounts = { valid: 0, invalid: 0, duplicate: 0, ambiguous: 0, over_allocation: 0, total: rows.length };
  for (const r of rows) if (r.state in c && r.state !== "total") c[r.state as EntryState] += 1;
  return c;
}

/** Blocking problems: nothing to issue, or more valid rows than slots. Invalid/duplicate rows are skipped, shown with their reason. */
export function confirmBlockers(counts: Pick<EntryCounts, "valid" | "over_allocation">): string[] {
  const out: string[] = [];
  if (counts.valid === 0) out.push("No valid rows to issue codes for");
  if (counts.over_allocation > 0) out.push(`${counts.over_allocation} rows are over the order's remaining slots`);
  return out;
}

/** Rows already on this order from an earlier import become duplicates; slots are then handed out again in file order. */
export function applyExisting(rows: readonly RosterRow[], existing: ReadonlySet<string>, remaining: number): RosterRow[] {
  let used = 0;
  const cap = Math.max(0, Math.floor(remaining));
  return rows.map((r) => {
    if (r.state !== "valid" && r.state !== "over_allocation") return r;
    if (r.email && existing.has(r.email)) return { ...r, state: "duplicate", reasons: ["already_on_order"] };
    if (used < cap) {
      used += 1;
      return { ...r, state: "valid", reasons: r.reasons.filter((x) => x !== "over_allocation") };
    }
    return { ...r, state: "over_allocation", reasons: ["over_allocation"] };
  });
}

/** Stored e-mail key: unique per (order, key). Only valid rows own the real address; the rest carry their import and row. */
export function entryEmailKey(row: Pick<RosterRow, "state" | "email" | "rowNo">, importId: string): string {
  return row.state === "valid" && row.email ? row.email : `${row.state}:${importId}:${row.rowNo}:${row.email ?? ""}`;
}
export function emailFromKey(state: string, key: string): string {
  return state === "valid" ? key : key.split(":").slice(3).join(":");
}

/** The paid path as a pure planner. `pay` runs the conditional UPDATE; `replay` returns the earlier result with no new rows. */
export type PaidPlan =
  | { kind: "pay" }
  | { kind: "replay"; seatBatchId: string | null }
  | { kind: "refuse"; status: 409; error: string };

export function planPaid(order: { status: string; seatBatchId: string | null }): PaidPlan {
  if (order.status === "pending") return { kind: "pay" };
  if (order.status === "paid") return { kind: "replay", seatBatchId: order.seatBatchId };
  return { kind: "refuse", status: 409, error: `This order is ${order.status.replace("_", " ")} and cannot be marked paid` };
}

/** The one seat-batch row a paid drive order creates. It never raises the college seat cap. */
export function seatBatchForOrder(order: { id: string; collegeId: string; slots: number; feePerStudentMinor: number; amountMinor: number; creditMinor: number }) {
  return {
    collegeId: order.collegeId,
    seats: order.slots,
    unitPriceMinor: order.feePerStudentMinor,
    amountMinor: order.amountMinor - order.creditMinor,
    status: "paid" as const,
    driveOrderId: order.id,
  };
}

/** Regression guard for the retired college-code path: a batch that backs a drive order never raises the seat cap. */
export function shouldRaiseSeatCap(batch: { driveOrderId: string | null | undefined }): boolean {
  return !batch.driveOrderId;
}

/** An identity-review decision: only a candidate listed for that entry may be linked. */
export function planIdentityDecision(
  input: { decision: unknown; internId?: unknown },
  review: { status: string; candidateInternId: string },
  listedCandidates: readonly string[],
): { ok: true; action: "link" | "reject"; internId: string | null } | { ok: false; status: 400 | 409; error: string } {
  if (input.decision !== "link" && input.decision !== "reject") return { ok: false, status: 400, error: "Decision must be link or reject" };
  if (review.status !== "pending") return { ok: false, status: 409, error: `This review is already ${review.status}` };
  if (input.decision === "reject") return { ok: true, action: "reject", internId: null };
  const internId = typeof input.internId === "string" && input.internId ? input.internId : review.candidateInternId;
  if (!listedCandidates.includes(internId)) return { ok: false, status: 400, error: "That student is not a suggested match for this row" };
  return { ok: true, action: "link", internId };
}

/** Confirm is allowed only on a preview of a paid order with enough slots and a future code expiry. */
export function confirmProblem(
  order: { status: string; slots: number; issuedCount: number; codeValidUntil: Date | null },
  validRows: number,
  now: Date,
): { status: 409 | 400; error: string } | null {
  if (order.status !== "paid") return { status: 409, error: "The drive order is not paid" };
  if (!order.codeValidUntil || order.codeValidUntil.getTime() <= now.getTime()) return { status: 409, error: "The code validity date has passed" };
  if (validRows < 1) return { status: 400, error: "No valid rows to issue codes for" };
  if (validRows > Math.max(0, order.slots - order.issuedCount)) return { status: 409, error: "More valid rows than remaining slots" };
  return null;
}

/** Rupees typed in a form to whole paise; null when not a sensible amount. */
export function rupeesToMinor(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
