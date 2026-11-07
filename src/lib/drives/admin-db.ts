/**
 * Postgres side of the admin drive-order, import and identity-review routes.
 * Every write runs inside withPgTransaction on one connection; decisions come from admin-rules.ts and the Wave 1 libs.
 * Audit rows are written on the same connection, so a failed audit rolls the change back.
 */
import { NextResponse } from "next/server";

import { allows, requiredPermissions } from "../admin/permissions.ts";
import { redactMeta, type AuditAction } from "../admin/audit.ts";
import { activationBlocker, validateOrderInput, type OrderValue } from "../college/drive-order.ts";
import { asSqlExecutor, withPgTransaction, type PgClient } from "../db/pg-tx.ts";
import { getDb } from "../db/index.ts";
import { issueCodes, type DriveCodeRow } from "./codes.ts";
import { driveCodeSecret } from "./code-derive.ts";
import { fileSha256 } from "./import/hash.ts";
import { suggestedMapping, detectHeaderRow, type Mapping } from "./import/headers.ts";
import { matchEntry, type CandidateUser } from "./import/match.ts";
import { planConfirm } from "./import/plan.ts";
import { readRosterRows } from "./import/read.ts";
import { validateRows } from "./import/validate.ts";
import {
  MAX_IMPORT_ROWS, PREVIEW_ROWS, applyExisting, confirmProblem, countStates, emailFromKey, entryEmailKey, planIdentityDecision, planPaid, sameMapping, seatBatchForOrder, validateMapping,
  type EntryCounts,
} from "./admin-rules.ts";

import { formatInvoiceNumber } from "../invoice.ts";
import { financialYear } from "../invoice-number.ts";

type Row = Record<string, unknown>;
export const pool = () => getDb().$client as unknown as PgClient;

/** Audit actions for this feature. Cast because the label catalogue in admin/audit.ts is outside this package: the integrator adds the labels. */
const ACT = {
  orderCreate: "drive_order.create",
  orderPaid: "drive_order.paid",
  importPreview: "drive_import.preview",
  importConfirm: "drive_import.confirm",
  identityDecide: "identity_review.decide",
} as const;

async function audit(c: PgClient, adminId: string, action: keyof typeof ACT, targetType: string, targetId: string, meta: Record<string, unknown>) {
  await c.query("INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, meta) VALUES ($1,$2,$3,$4,$5::jsonb)", [
    adminId, ACT[action] as unknown as AuditAction, targetType, targetId, JSON.stringify(redactMeta(meta)),
  ]);
}

/** GET permission check after the route has confirmed an admin session; the proxy applies the same path rule. */
export function readDenied(req: Request, permissions: readonly string[] | undefined): NextResponse | null {
  return allows(permissions, requiredPermissions(new URL(req.url).pathname, "GET")) ? null : NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[drive-admin]", e);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

export function orderDto(r: Row) {
  return {
    id: String(r.id), collegeId: String(r.college_id), driveId: (r.drive_id as string | null) ?? null,
    slots: Number(r.slots), feePerStudentMinor: Number(r.fee_per_student_minor), amountMinor: Number(r.amount_minor), creditMinor: Number(r.credit_minor),
    payableMinor: Number(r.amount_minor) - Number(r.credit_minor), status: String(r.status), seatBatchId: (r.seat_batch_id as string | null) ?? null,
    issuedCount: Number(r.issued_count), redeemedCount: Number(r.redeemed_count), codeValidUntil: iso(r.code_valid_until), paidAt: iso(r.paid_at),
    gatewayRef: (r.gateway_ref as string | null) ?? null, createdAt: iso(r.created_at),
  };
}
export type OrderDto = ReturnType<typeof orderDto>;

export async function listOrders(collegeId: string): Promise<OrderDto[]> {
  const r = await pool().query("SELECT * FROM college_drive_orders WHERE college_id = $1 ORDER BY created_at DESC LIMIT 200", [collegeId]);
  return r.rows.map(orderDto);
}

/* ── create order ─────────────────────────────────────────────────────────── */

export async function createOrder(input: { collegeId: string; driveId: string | null; value: OrderValue; adminId: string; key: string | null }): Promise<{ order: OrderDto; replayed: boolean }> {
  return withPgTransaction(async (c) => {
    if (input.key) {
      // Same admin + same key = same order: serialised by an advisory lock, found again through the audit trail.
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`drive-order:${input.adminId}:${input.key}`]);
      const prior = await c.query(
        "SELECT o.* FROM admin_audit_log a JOIN college_drive_orders o ON o.id = a.target_id WHERE a.action = $1 AND a.admin_id = $2 AND a.meta->>'idempotencyKey' = $3 LIMIT 1",
        [ACT.orderCreate, input.adminId, input.key],
      );
      if (prior.rows[0]) return { order: orderDto(prior.rows[0]), replayed: true };
    }
    const col = await c.query("SELECT is_partner FROM colleges WHERE id = $1", [input.collegeId]);
    if (!col.rows[0]) throw new HttpError(404, "Not found");
    if (!col.rows[0].is_partner) throw new HttpError(400, "Only partner colleges can buy drive orders");
    if (input.driveId) {
      const d = await c.query("SELECT 1 FROM college_drives WHERE id = $1 AND college_id = $2", [input.driveId, input.collegeId]);
      if (!d.rows[0]) throw new HttpError(400, "That drive does not belong to this college");
      const taken = await c.query("SELECT 1 FROM college_drive_orders WHERE drive_id = $1", [input.driveId]);
      if (taken.rows[0]) throw new HttpError(409, "That drive already has an order");
    }
    const v = input.value;
    const ins = await c.query(
      "INSERT INTO college_drive_orders (college_id, drive_id, slots, fee_per_student_minor, amount_minor, credit_minor, code_valid_until, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [input.collegeId, input.driveId, v.slots, v.feePerStudentMinor, v.amountMinor, v.creditMinor, v.codeValidUntil, input.adminId],
    );
    const order = orderDto(ins.rows[0]);
    await audit(c, input.adminId, "orderCreate", "drive_order", order.id, { collegeId: input.collegeId, slots: v.slots, feePerStudentMinor: v.feePerStudentMinor, creditMinor: v.creditMinor, amountMinor: v.amountMinor, idempotencyKey: input.key });
    return { order, replayed: false };
  });
}

export { validateOrderInput };

/* ── mark paid ────────────────────────────────────────────────────────────── */

export async function markOrderPaid(input: { orderId: string; method: string; reference: string; adminId: string }): Promise<{ order: OrderDto; replayed: boolean; activated: boolean }> {
  return withPgTransaction(async (c) => {
    const cur = await c.query("SELECT * FROM college_drive_orders WHERE id = $1 FOR UPDATE", [input.orderId]);
    if (!cur.rows[0]) throw new HttpError(404, "Not found");
    const plan = planPaid({ status: String(cur.rows[0].status), seatBatchId: (cur.rows[0].seat_batch_id as string | null) ?? null });
    if (plan.kind === "refuse") throw new HttpError(plan.status, plan.error);
    if (plan.kind === "replay") return { order: orderDto(cur.rows[0]), replayed: true, activated: false };

    const now = new Date();
    const upd = await c.query(
      "UPDATE college_drive_orders SET status = 'paid', paid_at = $2, gateway_ref = $3, verified_by = $4, updated_at = $2 WHERE id = $1 AND status = 'pending' RETURNING *",
      [input.orderId, now, input.reference, input.adminId],
    );
    if ((upd.rowCount ?? 0) !== 1) throw new HttpError(409, "This order was just updated. Reload and check.");
    const o = orderDto(upd.rows[0]);
    const b = seatBatchForOrder(o);
    // Exactly one batch per order (unique drive_order_id). No cap is raised and no TPO code is created for it.
    const batch = await c.query(
      "INSERT INTO college_seat_batches (college_id, seats, unit_price_minor, amount_minor, status, method, reference_id, paid_at, drive_order_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
      [b.collegeId, b.seats, b.unitPriceMinor, b.amountMinor, b.status, input.method, input.reference, now, b.driveOrderId, input.adminId],
    );
    const seatBatchId = String(batch.rows[0].id);
    // Same GST serial as every other seat batch, taken in this transaction so a rollback returns it.
    const counter = await c.query(
      "INSERT INTO invoice_counters (fy, last) VALUES ($1, 1) ON CONFLICT (fy) DO UPDATE SET last = invoice_counters.last + 1, updated_at = now() RETURNING last",
      [financialYear(now)],
    );
    const invoiceNumber = formatInvoiceNumber(now, Number(counter.rows[0].last));
    await c.query("UPDATE college_seat_batches SET invoice_number = $2 WHERE id = $1 AND invoice_number IS NULL", [seatBatchId, invoiceNumber]);
    const linked = await c.query("UPDATE college_drive_orders SET seat_batch_id = $2 WHERE id = $1 RETURNING *", [input.orderId, seatBatchId]);
    const order = orderDto(linked.rows[0]);
    let activated = false;
    if (order.driveId && activationBlocker({ status: order.status }) === null) {
      const d = await c.query("UPDATE college_drives SET order_id = $2, updated_at = $3 WHERE id = $1 AND college_id = $4 AND (order_id IS NULL OR order_id = $2)", [order.driveId, order.id, now, order.collegeId]);
      activated = (d.rowCount ?? 0) === 1;
    }
    await audit(c, input.adminId, "orderPaid", "drive_order", order.id, { collegeId: order.collegeId, seatBatchId, invoiceNumber, method: input.method, referenceId: input.reference, payableMinor: order.payableMinor, activated });
    return { order, replayed: false, activated };
  });
}

/* ── import preview ───────────────────────────────────────────────────────── */

export type PreviewRow = { rowNo: number; name: string; email: string; phone: string | null; state: string; reasons: string[] };
export type ImportView = { importId: string; status: string; mapping: Mapping; counts: EntryCounts; rows: PreviewRow[]; truncated: boolean; replayed: boolean; result?: unknown };

async function loadView(c: PgClient, importId: string, replayed: boolean): Promise<ImportView> {
  const imp = await c.query("SELECT * FROM drive_imports WHERE id = $1", [importId]);
  if (!imp.rows[0]) throw new HttpError(404, "Not found");
  const e = await c.query("SELECT row_no, name, college_email_norm, phone_e164, state, reasons FROM drive_roster_entries WHERE import_id = $1 ORDER BY row_no LIMIT $2", [importId, PREVIEW_ROWS + 1]);
  const rows = e.rows.slice(0, PREVIEW_ROWS).map((r) => ({ rowNo: Number(r.row_no), name: String(r.name), email: emailFromKey(String(r.state), String(r.college_email_norm)), phone: (r.phone_e164 as string | null) ?? null, state: String(r.state), reasons: (r.reasons as string[]) ?? [] }));
  const stored = (imp.rows[0].counts ?? {}) as { total?: number; result?: unknown } & Partial<EntryCounts>;
  const counts = countStates(e.rows.length > PREVIEW_ROWS ? [] : rows);
  const full: EntryCounts = e.rows.length > PREVIEW_ROWS ? { valid: stored.valid ?? 0, invalid: stored.invalid ?? 0, duplicate: stored.duplicate ?? 0, ambiguous: stored.ambiguous ?? 0, over_allocation: stored.over_allocation ?? 0, total: stored.total ?? 0 } : counts;
  return { importId, status: String(imp.rows[0].status), mapping: imp.rows[0].mapping as Mapping, counts: full, rows, truncated: e.rows.length > PREVIEW_ROWS, replayed, result: stored.result };
}

export async function getImportView(importId: string) {
  return loadView(pool(), importId, false);
}
export async function listImports(orderId: string) {
  const r = await pool().query("SELECT id, file_name, status, counts, created_at, confirmed_at FROM drive_imports WHERE order_id = $1 ORDER BY created_at DESC LIMIT 50", [orderId]);
  return r.rows.map((x) => ({ id: String(x.id), fileName: String(x.file_name), status: String(x.status), counts: x.counts, createdAt: iso(x.created_at), confirmedAt: iso(x.confirmed_at) }));
}

async function insertEntries(c: PgClient, orderId: string, importId: string, rows: ReturnType<typeof applyExisting>) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const params: unknown[] = [];
    const tuples = chunk.map((r, j) => {
      const b = j * 8;
      params.push(orderId, importId, r.rowNo, r.name, entryEmailKey(r, importId), r.phone, r.state, JSON.stringify(r.reasons));
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8}::jsonb)`;
    });
    await c.query(`INSERT INTO drive_roster_entries (order_id, import_id, row_no, name, college_email_norm, phone_e164, state, reasons) VALUES ${tuples.join(",")}`, params);
  }
}

export type PreviewResult =
  | { needsMapping: true; headers: string[]; suggestedMapping: Mapping }
  | { needsMapping: false; headers: string[]; suggestedMapping: Mapping; view: ImportView };

/** Reads the bytes, then stores (or returns) the preview. The server derives every row itself; nothing the client edits is trusted. */
export async function createImportPreview(input: { orderId: string; bytes: Uint8Array; fileName: string; mappingRaw: unknown | null; adminId: string }): Promise<PreviewResult> {
  let all: string[][];
  try { all = readRosterRows(input.bytes); } catch { throw new HttpError(400, "That file could not be read as CSV or Excel"); }
  const headerIdx = Math.max(0, detectHeaderRow(all));
  const headers = (all[headerIdx] ?? []).map((h) => String(h ?? "").trim());
  const data = all.slice(headerIdx + 1).filter((r) => r.some((x) => String(x ?? "").trim() !== ""));
  if (data.length === 0) throw new HttpError(400, "The file has no student rows");
  if (data.length > MAX_IMPORT_ROWS) throw new HttpError(400, `A file can have at most ${MAX_IMPORT_ROWS} rows`);
  const suggested = suggestedMapping(headers);
  let mapping: Mapping;
  if (input.mappingRaw !== null) {
    const m = validateMapping(input.mappingRaw, headers.length);
    if (!m.ok) throw new HttpError(400, m.error);
    mapping = m.mapping;
  } else {
    const m = validateMapping(suggested, headers.length);
    if (!m.ok) return { needsMapping: true, headers, suggestedMapping: suggested };
    mapping = m.mapping;
  }
  const sha = fileSha256(input.bytes);

  const view = await withPgTransaction(async (c) => {
    const ord = await c.query("SELECT * FROM college_drive_orders WHERE id = $1 FOR UPDATE", [input.orderId]);
    if (!ord.rows[0]) throw new HttpError(404, "Not found");
    const order = orderDto(ord.rows[0]);
    if (!["pending", "paid"].includes(order.status)) throw new HttpError(409, `This order is ${order.status.replace("_", " ")}`);
    const ex = await c.query("SELECT id, status, mapping FROM drive_imports WHERE order_id = $1 AND file_sha256 = $2 AND status <> 'void'", [input.orderId, sha]);
    const same = ex.rows[0];
    if (same && (same.status !== "preview" || input.mappingRaw === null || sameMapping(same.mapping as Mapping, mapping))) return loadView(c, String(same.id), true);

    const others = await c.query("SELECT college_email_norm FROM drive_roster_entries WHERE order_id = $1 AND state = 'valid' AND import_id <> $2", [input.orderId, same ? String(same.id) : "-"]);
    const existing = new Set(others.rows.map((r) => String(r.college_email_norm)));
    const remaining = Math.max(0, order.slots - order.issuedCount);
    const rows = applyExisting(validateRows(data, mapping, remaining), existing, remaining);
    const counts = countStates(rows);
    let importId: string;
    if (same) {
      importId = String(same.id);
      await c.query("DELETE FROM drive_roster_entries WHERE import_id = $1", [importId]);
      await c.query("UPDATE drive_imports SET mapping = $2::jsonb, counts = $3::jsonb WHERE id = $1", [importId, JSON.stringify(mapping), JSON.stringify(counts)]);
    } else {
      const ins = await c.query("INSERT INTO drive_imports (order_id, file_sha256, file_name, mapping, counts, created_by) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6) RETURNING id", [input.orderId, sha, input.fileName.slice(0, 200), JSON.stringify(mapping), JSON.stringify(counts), input.adminId]);
      importId = String(ins.rows[0].id);
    }
    await insertEntries(c, input.orderId, importId, rows);
    await audit(c, input.adminId, "importPreview", "drive_import", importId, { orderId: input.orderId, fileName: input.fileName.slice(0, 200), sha256: sha, counts });
    return loadView(c, importId, false);
  });
  return { needsMapping: false, headers, suggestedMapping: suggested, view };
}

/* ── confirm ──────────────────────────────────────────────────────────────── */

export type ConfirmResult = { linked: number; reviews: number; codesIssued: number; skipped: number };

async function verifyMembership(c: PgClient, internId: string, collegeId: string) {
  // Never moves a student between colleges and never touches users: only an own-college membership is created or upgraded.
  await c.query(
    "INSERT INTO college_memberships (user_id, college_id, status, verified_by) VALUES ($1,$2,'verified','roster') ON CONFLICT (user_id) DO UPDATE SET status = 'verified', verified_by = 'roster', left_at = NULL WHERE college_memberships.college_id = EXCLUDED.college_id",
    [internId, collegeId],
  );
}

export async function confirmImport(input: { importId: string; adminId: string }): Promise<{ result: ConfirmResult; replayed: boolean }> {
  return withPgTransaction(async (c) => {
    const imp = await c.query("SELECT * FROM drive_imports WHERE id = $1 FOR UPDATE", [input.importId]);
    if (!imp.rows[0]) throw new HttpError(404, "Not found");
    if (imp.rows[0].status === "confirmed") return { result: ((imp.rows[0].counts as { result?: ConfirmResult }).result ?? { linked: 0, reviews: 0, codesIssued: 0, skipped: 0 }), replayed: true };
    if (imp.rows[0].status !== "preview") throw new HttpError(409, "This import was voided");
    const ord = await c.query("SELECT * FROM college_drive_orders WHERE id = $1 FOR UPDATE", [imp.rows[0].order_id]);
    const orderRow = ord.rows[0];
    if (!orderRow) throw new HttpError(404, "Not found");
    const order = orderDto(orderRow);
    const ents = await c.query("SELECT id, row_no, name, college_email_norm, phone_e164 FROM drive_roster_entries WHERE import_id = $1 AND state = 'valid' ORDER BY row_no", [input.importId]);
    const problem = confirmProblem({ status: order.status, slots: order.slots, issuedCount: order.issuedCount, codeValidUntil: orderRow.code_valid_until ? new Date(orderRow.code_valid_until as Date) : null }, ents.rows.length, new Date());
    if (problem) throw new HttpError(problem.status, problem.error);

    const emails = ents.rows.map((r) => String(r.college_email_norm));
    const phones = ents.rows.map((r) => r.phone_e164 as string | null).filter((p): p is string => !!p).map((p) => p.slice(3));
    // Verified-email exact matches by the unique email index; phone candidates by the (country, phone) unique index. Role intern only.
    const users = await c.query(
      "SELECT id, email, email_verified, country_code, phone_number, first_name, last_name FROM users WHERE role = 'intern' AND ((email = ANY($1::text[]) AND email_verified) OR (country_code = '+91' AND phone_number = ANY($2::text[])))",
      [emails, phones],
    );
    const candidates: CandidateUser[] = users.rows.map((u) => ({ id: String(u.id), email: String(u.email), emailVerified: !!u.email_verified, phone: `${String(u.country_code).trim()}${String(u.phone_number).replace(/\D/g, "")}`, name: `${u.first_name} ${u.last_name}` }));
    const byRow = new Map(ents.rows.map((r) => [Number(r.row_no), r]));
    const matches = ents.rows.map((r) => ({ rowNo: Number(r.row_no), email: String(r.college_email_norm), match: matchEntry({ email: String(r.college_email_norm), phone: (r.phone_e164 as string | null) ?? null, name: String(r.name) }, candidates) }));
    const plan = planConfirm(matches.map((m) => ({ rowNo: m.rowNo, email: m.email, state: "valid" as const, match: m.match })));

    for (const m of matches) await c.query("UPDATE drive_roster_entries SET match = $2::jsonb WHERE id = $1", [byRow.get(m.rowNo)!.id, JSON.stringify(m.match)]);
    let linked = 0;
    for (const l of plan.link) {
      const u = await c.query("UPDATE drive_roster_entries SET intern_id = $2 WHERE id = $1 AND intern_id IS NULL", [byRow.get(l.rowNo)!.id, l.internId]);
      if ((u.rowCount ?? 0) === 1) { linked += 1; await verifyMembership(c, l.internId, order.collegeId); }
    }
    let reviews = 0;
    for (const r of plan.reviews) {
      const u = await c.query("INSERT INTO identity_reviews (order_id, entry_id, candidate_intern_id, kind) VALUES ($1,$2,$3,'phone_name') ON CONFLICT (entry_id, candidate_intern_id) DO NOTHING", [order.id, byRow.get(r.rowNo)!.id, r.candidateInternId]);
      reviews += u.rowCount ?? 0;
    }
    // One code per student: every valid row that has no code yet (linked, suggested, ambiguous or unmatched alike; the code is the entitlement).
    const need = await c.query("SELECT e.id FROM drive_roster_entries e WHERE e.import_id = $1 AND e.state = 'valid' AND NOT EXISTS (SELECT 1 FROM drive_codes k WHERE k.entry_id = e.id) ORDER BY e.row_no", [input.importId]);
    const ex = asSqlExecutor(c);
    const issued = await issueCodes(
      { ...ex, insertDriveCodes: (rows) => insertCodes(c, rows) },
      { orderId: order.id, entryIds: need.rows.map((r) => String(r.id)), validUntil: new Date(orderRow.code_valid_until as Date), secret: driveCodeSecret() },
    );
    if (!issued.ok) throw new HttpError(409, "The order cannot issue that many codes");
    const result: ConfirmResult = { linked, reviews, codesIssued: issued.issued.length, skipped: ents.rows.length - issued.issued.length };
    await c.query("UPDATE drive_imports SET status = 'confirmed', confirmed_at = now(), counts = counts || $2::jsonb WHERE id = $1 AND status = 'preview'", [input.importId, JSON.stringify({ result })]);
    await audit(c, input.adminId, "importConfirm", "drive_import", input.importId, { orderId: order.id, ...result });
    return { result, replayed: false };
  });
}

async function insertCodes(c: PgClient, rows: DriveCodeRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const params: unknown[] = [];
    const tuples = chunk.map((r, j) => {
      const b = j * 7;
      params.push(r.id, r.orderId, r.entryId, r.codeHash, r.codeLast4, r.status, r.validUntil);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    });
    await c.query(`INSERT INTO drive_codes (id, order_id, entry_id, code_hash, code_last4, status, valid_until) VALUES ${tuples.join(",")}`, params);
  }
}

/* ── identity reviews ─────────────────────────────────────────────────────── */

export async function listPendingReviews(collegeId: string) {
  const r = await pool().query(
    `SELECT v.id, v.order_id, v.entry_id, v.candidate_intern_id, e.name AS entry_name, e.college_email_norm, e.phone_e164,
            u.first_name, u.last_name, u.email AS candidate_email
       FROM identity_reviews v
       JOIN college_drive_orders o ON o.id = v.order_id
       JOIN drive_roster_entries e ON e.id = v.entry_id
       JOIN users u ON u.id = v.candidate_intern_id
      WHERE o.college_id = $1 AND v.status = 'pending' ORDER BY v.created_at LIMIT 200`,
    [collegeId],
  );
  return r.rows.map((x) => ({ id: String(x.id), orderId: String(x.order_id), entryName: String(x.entry_name), entryEmail: String(x.college_email_norm), entryPhone: (x.phone_e164 as string | null) ?? null, candidateId: String(x.candidate_intern_id), candidateName: `${x.first_name} ${x.last_name}`, candidateEmail: String(x.candidate_email) }));
}
export type ReviewDto = Awaited<ReturnType<typeof listPendingReviews>>[number];

export async function decideReview(input: { reviewId: string; decision: unknown; internId?: unknown; adminId: string }): Promise<{ status: "linked" | "rejected"; internId: string | null; replayed: boolean }> {
  return withPgTransaction(async (c) => {
    const rv = await c.query("SELECT v.*, o.college_id FROM identity_reviews v JOIN college_drive_orders o ON o.id = v.order_id WHERE v.id = $1 FOR UPDATE OF v", [input.reviewId]);
    const review = rv.rows[0];
    if (!review) throw new HttpError(404, "Not found");
    const listed = await c.query("SELECT candidate_intern_id FROM identity_reviews WHERE entry_id = $1", [review.entry_id]);
    const plan = planIdentityDecision({ decision: input.decision, internId: input.internId }, { status: String(review.status), candidateInternId: String(review.candidate_intern_id) }, listed.rows.map((r) => String(r.candidate_intern_id)));
    if (!plan.ok) {
      // Repeating the decision that was already made is a no-op, not an error.
      if (plan.status === 409 && ((input.decision === "reject" && review.status === "rejected") || (input.decision === "link" && review.status === "linked" && (input.internId === undefined || input.internId === review.candidate_intern_id)))) {
        return { status: review.status as "linked" | "rejected", internId: review.status === "linked" ? String(review.candidate_intern_id) : null, replayed: true };
      }
      throw new HttpError(plan.status, plan.error);
    }
    const now = new Date();
    if (plan.action === "reject") {
      await c.query("UPDATE identity_reviews SET status = 'rejected', decided_by = $2, decided_at = $3 WHERE id = $1", [input.reviewId, input.adminId, now]);
      await audit(c, input.adminId, "identityDecide", "identity_review", input.reviewId, { decision: "reject", entryId: String(review.entry_id), candidateInternId: String(review.candidate_intern_id) });
      return { status: "rejected" as const, internId: null, replayed: false };
    }
    const internId = plan.internId!;
    const u = await c.query("UPDATE drive_roster_entries SET intern_id = $2 WHERE id = $1 AND intern_id IS NULL", [review.entry_id, internId]);
    if ((u.rowCount ?? 0) !== 1) throw new HttpError(409, "This row is already linked to a student");
    await verifyMembership(c, internId, String(review.college_id));
    await c.query("UPDATE identity_reviews SET status = CASE WHEN candidate_intern_id = $2 THEN 'linked' ELSE 'rejected' END, decided_by = $3, decided_at = $4 WHERE entry_id = $1 AND status = 'pending'", [review.entry_id, internId, input.adminId, now]);
    await audit(c, input.adminId, "identityDecide", "identity_review", input.reviewId, { decision: "link", entryId: String(review.entry_id), internId });
    return { status: "linked" as const, internId, replayed: false };
  });
}
