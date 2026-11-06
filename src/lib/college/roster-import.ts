import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

import { isXlsx, readXlsxRows } from "../xlsx.ts";
import { parseRosterTable, splitCsv, type ParsedRoster, type RosterInput, type RosterMapping } from "./roster.ts";

/**
 * Admin roster import (WP-B): upload → classified preview → confirm.
 *
 * The pure half (hashing, reading a file into a table, classifying, counting, the over-allocation
 * check) has no database import, so it is unit tested in plain node. The database half loads
 * `@/lib/db` lazily for the same reason (as `lib/admin/audit.ts` does).
 *
 * Matching (OA5): a roster row links to an account ONLY when roster email == users.email, that
 * email is verified and the role is intern. A shared phone or name never links; it lands in the
 * admin review queue. Linking records `matched_user_id` and does not grant the fee waiver.
 */

export const MAX_IMPORT_BYTES = 2_000_000;
const MAX_CANDIDATES = 5;

// ── Pure ─────────────────────────────────────────────────────────────────

export type RowStatus = "valid" | "invalid" | "duplicate" | "update";
export type MatchKind = "email" | "review" | "unmatched";
export type Candidate = { userId: string; reason: "phone" | "name" };
export type MatchResult =
  | { kind: "email"; userId: string }
  | { kind: "review"; candidates: Candidate[] }
  | { kind: "unmatched" };

export type PreviewRow = {
  line: number;
  name: string;
  email: string;
  phone: string;
  status: RowStatus;
  reason?: string;
  match?: MatchKind;
};

export type ImportCounts = {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  update: number;
  matchedEmail: number;
  review: number;
  unmatched: number;
};

export const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export class ImportError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** A file as rows of strings. Accepts .csv/.tsv/.xlsx; the bytes decide whether it is a zip. */
export function readTable(fileName: string, bytes: Uint8Array): string[][] {
  if (!/\.(csv|tsv|xlsx)$/i.test(fileName)) throw new ImportError("Upload a .csv, .tsv or .xlsx file.", 400);
  if (bytes.length === 0) throw new ImportError("The file is empty.", 400);
  if (bytes.length > MAX_IMPORT_BYTES) throw new ImportError("The file is larger than 2 MB. Split it and upload each part.", 413);
  if (isXlsx(bytes)) {
    try {
      return readXlsxRows(bytes).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
    } catch {
      throw new ImportError("That Excel file could not be read. Save it again as .xlsx or .csv.", 400);
    }
  }
  if (/\.xlsx$/i.test(fileName)) throw new ImportError("That file is not a valid Excel workbook. Save it again as .xlsx or .csv.", 400);
  return splitCsv(new TextDecoder("utf-8").decode(bytes));
}

export const REASON = {
  update: "Already on the roster (will update name/phone)",
  samePhone: "Possible match: same phone",
  sameName: "Possible match: same name",
} as const;

/** Classify parsed rows against the roster that already exists and the matches found for them. */
export function buildPreviewRows(parsed: ParsedRoster, existing: ReadonlySet<string>, matches: ReadonlyMap<string, MatchResult>): PreviewRow[] {
  return parsed.results.map((r) => {
    const row: PreviewRow = { line: r.line, name: r.name, email: r.email, phone: r.phone, status: r.status, ...(r.reason ? { reason: r.reason } : {}) };
    if (r.status !== "valid") return row;
    if (existing.has(r.email)) {
      row.status = "update";
      row.reason = REASON.update;
    }
    const m = matches.get(r.email) ?? { kind: "unmatched" as const };
    row.match = m.kind;
    if (m.kind === "review") {
      row.reason = m.candidates[0]?.reason === "phone" ? REASON.samePhone : REASON.sameName;
    }
    return row;
  });
}

export function countRows(rows: readonly PreviewRow[]): ImportCounts {
  const c: ImportCounts = { total: rows.length, valid: 0, invalid: 0, duplicate: 0, update: 0, matchedEmail: 0, review: 0, unmatched: 0 };
  for (const r of rows) {
    c[r.status]++;
    if (r.match === "email") c.matchedEmail++;
    else if (r.match === "review") c.review++;
    else if (r.match === "unmatched") c.unmatched++;
  }
  return c;
}

/** The roster once this file is in, against the seats the college has paid for. */
export function overAllocationOf(existingRosterSize: number, newRows: number, paidSeats: number) {
  const rosterAfter = existingRosterSize + newRows;
  return { rosterAfter, paidSeats, over: rosterAfter > paidSeats };
}

export function validateMapping(mapping: RosterMapping, width: number): string | null {
  const ok = (n: number) => Number.isInteger(n) && n >= 0 && n < width;
  if (!ok(mapping.email)) return "Choose the column that holds the email.";
  if (mapping.name !== -1 && !ok(mapping.name)) return "Choose a column from the file for the name.";
  if (mapping.phone !== null && !ok(mapping.phone)) return "Choose a column from the file for the phone.";
  return null;
}

// ── Stored shape ─────────────────────────────────────────────────────────
// `college_roster_imports.rows` keeps the file itself so a remap needs no re-upload: element 0 is the
// header, the rest are the classified rows, each with its raw `cells`.

type StoredHeader = { line: 1; status: "header"; cells: string[] };
type StoredRow = PreviewRow & { cells: string[] };
type Stored = [StoredHeader, ...StoredRow[]];

const toTable = (stored: Stored): string[][] => stored.map((r) => r.cells);
const isStored = (rows: unknown): rows is Stored => Array.isArray(rows) && (rows[0] as StoredHeader | undefined)?.status === "header";

export type ImportPreview = {
  importId: string;
  status: string;
  mapping: RosterMapping;
  headers: string[];
  counts: ImportCounts;
  overAllocation: { rosterAfter: number; paidSeats: number };
  rows: PreviewRow[];
};

// ── Database ─────────────────────────────────────────────────────────────

async function lib() {
  const { getDb, schema } = await import("@/lib/db");
  const { recordAdminAudit } = await import("@/lib/admin/audit");
  const { paidSeatTotal } = await import("./seat-gate");
  return { db: getDb(), schema, recordAdminAudit, paidSeatTotal };
}
type Lib = Awaited<ReturnType<typeof lib>>;
type Db = Lib["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const chunks = <T>(xs: T[], n = 1000): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

async function existingEmails(l: Lib, ex: Db | Tx, collegeId: string, emails: string[]): Promise<Set<string>> {
  const R = l.schema.collegeRoster;
  const out = new Set<string>();
  for (const part of chunks(emails)) {
    const rows = await ex.select({ email: R.email }).from(R).where(and(eq(R.collegeId, collegeId), inArray(R.email, part)));
    for (const r of rows) out.add(r.email);
  }
  return out;
}

/**
 * Email (verified intern) auto-links; a shared phone or name goes to review; nothing else matches.
 * Users already linked to a different roster row of this college are skipped (one account per roster row).
 */
export async function findMatches(l: Lib, ex: Db | Tx, collegeId: string, rows: Pick<RosterInput, "email" | "name" | "phone">[]): Promise<Map<string, MatchResult>> {
  const { users: U, collegeRoster: R, collegeMemberships: M } = l.schema;
  const out = new Map<string, MatchResult>();
  if (rows.length === 0) return out;

  const linked = await ex.select({ userId: R.matchedUserId, email: R.email }).from(R).where(and(eq(R.collegeId, collegeId), sql`${R.matchedUserId} is not null`));
  const linkedTo = new Map(linked.map((r) => [String(r.userId), r.email]));

  const verified = new Map<string, string>();
  for (const part of chunks(rows.map((r) => r.email))) {
    const found = await ex
      .select({ id: U.id, email: sql<string>`lower(${U.email})` })
      .from(U)
      .where(and(eq(U.role, "intern"), eq(U.emailVerified, true), inArray(sql`lower(${U.email})`, part)));
    for (const f of found) verified.set(f.email, f.id);
  }
  const claimed = new Set<string>();
  for (const r of rows) {
    const id = verified.get(r.email);
    if (id && (linkedTo.get(id) ?? r.email) === r.email) {
      out.set(r.email, { kind: "email", userId: id });
      claimed.add(id);
    }
  }

  const rest = rows.filter((r) => !out.has(r.email));
  const byPhone = new Map<string, string[]>();
  const phones = [...new Set(rest.map((r) => r.phone).filter((p): p is string => Boolean(p)))];
  for (const part of chunks(phones)) {
    const found = await ex
      .select({ id: U.id, phone: U.phoneNumber })
      .from(U)
      .where(and(eq(U.role, "intern"), eq(U.countryCode, "+91"), inArray(U.phoneNumber, part)));
    for (const f of found) byPhone.set(f.phone, [...(byPhone.get(f.phone) ?? []), f.id]);
  }
  // Names are compared only among this college's own members, so a common name never fans out across all students.
  const byName = new Map<string, string[]>();
  if (rest.some((r) => r.name.trim())) {
    const members = await ex
      .select({ id: U.id, name: sql<string>`lower(regexp_replace(trim(${U.firstName} || ' ' || ${U.lastName}), '\\s+', ' ', 'g'))` })
      .from(M)
      .innerJoin(U, eq(U.id, M.userId))
      .where(and(eq(M.collegeId, collegeId), sql`${M.leftAt} is null`));
    for (const m of members) byName.set(m.name, [...(byName.get(m.name) ?? []), m.id]);
  }
  const free = (id: string) => !linkedTo.has(id) && !claimed.has(id);
  for (const r of rest) {
    const cands: Candidate[] = [];
    const add = (id: string, reason: Candidate["reason"]) => {
      if (free(id) && !cands.some((c) => c.userId === id)) cands.push({ userId: id, reason });
    };
    if (r.phone) for (const id of byPhone.get(r.phone) ?? []) add(id, "phone");
    const nm = r.name.trim().toLowerCase().replace(/\s+/g, " ");
    if (nm) for (const id of byName.get(nm) ?? []) add(id, "name");
    out.set(r.email, cands.length ? { kind: "review", candidates: cands.slice(0, MAX_CANDIDATES) } : { kind: "unmatched" });
  }
  return out;
}

async function rosterSize(l: Lib, ex: Db | Tx, collegeId: string): Promise<number> {
  const R = l.schema.collegeRoster;
  const [r] = await ex.select({ n: sql<number>`count(*)::int` }).from(R).where(eq(R.collegeId, collegeId));
  return r?.n ?? 0;
}

/** Classify a parsed file against the database. */
async function classify(l: Lib, ex: Db | Tx, collegeId: string, parsed: ParsedRoster) {
  const existing = await existingEmails(l, ex, collegeId, parsed.rows.map((r) => r.email));
  const matches = await findMatches(l, ex, collegeId, parsed.rows);
  const rows = buildPreviewRows(parsed, existing, matches);
  const counts = countRows(rows);
  const [size, seats] = await Promise.all([rosterSize(l, ex, collegeId), l.paidSeatTotal(ex, collegeId)]);
  const alloc = overAllocationOf(size, counts.valid, seats.seats);
  return { rows, counts, alloc, matches };
}

function previewOf(imp: { id: string; status: string; mapping: RosterMapping; rows: unknown; counts: unknown; overAllocation: boolean }, alloc: { rosterAfter: number; paidSeats: number }): ImportPreview {
  const stored = isStored(imp.rows) ? imp.rows : null;
  return {
    importId: imp.id,
    status: imp.status,
    mapping: imp.mapping,
    headers: stored?.[0].cells ?? [],
    counts: imp.counts as ImportCounts,
    overAllocation: { rosterAfter: alloc.rosterAfter, paidSeats: alloc.paidSeats },
    rows: (stored?.slice(1) as StoredRow[] | undefined)?.map((r) => ({ line: r.line, name: r.name, email: r.email, phone: r.phone, status: r.status, reason: r.reason, match: r.match })) ?? [],
  };
}

function storedFrom(rows: PreviewRow[], table: string[][]): Stored {
  const byLine = new Map(table.slice(1).map((cells, i) => [i + 2, cells]));
  return [{ line: 1, status: "header", cells: table[0] }, ...rows.map((r) => ({ ...r, cells: byLine.get(r.line) ?? [] }))] as Stored;
}

export type PreviewOutcome =
  | { ok: true; preview: ImportPreview }
  /** No email column: the import is saved so the admin can map the columns without re-uploading. */
  | { ok: false; status: number; error: string; importId?: string; headers?: string[]; mapping?: RosterMapping };

export async function previewImport(input: { collegeId: string; adminId: string; fileName: string; bytes: Uint8Array; mapping?: RosterMapping }): Promise<PreviewOutcome> {
  const l = await lib();
  const { db, schema } = l;
  const I = schema.collegeRosterImports;
  const sha = sha256Hex(input.bytes);
  const [prior] = await db.select().from(I).where(and(eq(I.collegeId, input.collegeId), eq(I.fileSha256, sha))).limit(1);
  // The same file twice is the same import (idempotent retry); a discarded one is re-opened below.
  if (prior && prior.status !== "discarded") return sendPreview(l, prior);

  let table: string[][];
  try {
    table = readTable(input.fileName, input.bytes);
  } catch (e) {
    if (e instanceof ImportError) return { ok: false, status: e.status, error: e.message };
    throw e;
  }
  const parsed = parseRosterTable(table, input.mapping);
  if (parsed.header.length === 0) return { ok: false, status: 400, error: parsed.errors[0] ?? "The file could not be read." };

  const c = parsed.mapping.email < 0 ? null : await classify(l, db, input.collegeId, parsed);
  const rows = c?.rows ?? table.slice(1).map((cells, i): PreviewRow => ({ line: i + 2, name: "", email: "", phone: "", status: "invalid", reason: "Missing email" }));
  const values = {
    fileName: input.fileName.slice(0, 200),
    mapping: parsed.mapping,
    rows: storedFrom(rows, table) as unknown[],
    counts: (c?.counts ?? countRows(rows)) as unknown as Record<string, number>,
    status: "previewed",
    overAllocation: c?.alloc.over ?? false,
    createdBy: input.adminId,
    committedAt: null,
  };
  const [saved] = prior
    ? await db.update(I).set(values).where(eq(I.id, prior.id)).returning()
    : await db.insert(I).values({ collegeId: input.collegeId, fileSha256: sha, ...values }).onConflictDoNothing().returning();
  // A parallel upload of the same file won the insert: return that one.
  const imp = saved ?? (await db.select().from(I).where(and(eq(I.collegeId, input.collegeId), eq(I.fileSha256, sha))).limit(1))[0];
  if (!c) return { ok: false, status: 400, error: parsed.errors[0] ?? "No email column found.", importId: imp.id, headers: parsed.header, mapping: parsed.mapping };
  return { ok: true, preview: previewOf(imp, c.alloc) };
}

/** The saved preview for an existing import (its over-allocation is re-read, since seats and roster move). */
async function sendPreview(l: Lib, imp: typeof l.schema.collegeRosterImports.$inferSelect): Promise<PreviewOutcome> {
  const [size, seats] = await Promise.all([rosterSize(l, l.db, imp.collegeId), l.paidSeatTotal(l.db, imp.collegeId)]);
  const counts = imp.counts as unknown as ImportCounts;
  if (imp.mapping.email < 0) {
    return { ok: false, status: 400, error: "No email column found. Choose which column holds the email.", importId: imp.id, headers: isStored(imp.rows) ? imp.rows[0].cells : [], mapping: imp.mapping };
  }
  return { ok: true, preview: previewOf(imp, overAllocationOf(size, imp.status === "committed" ? 0 : counts.valid, seats.seats)) };
}

async function ownImport(l: Lib, ex: Db | Tx, collegeId: string, importId: string, lock = false) {
  const I = l.schema.collegeRosterImports;
  const q = ex.select().from(I).where(and(eq(I.id, importId), eq(I.collegeId, collegeId))).limit(1);
  const [imp] = lock ? await q.for("update") : await q;
  if (!imp) throw new ImportError("Import not found", 404);
  return imp;
}

const settled = (status: string) => new ImportError(`This import was already ${status}.`, 409);

export async function remapImport(input: { collegeId: string; importId: string; mapping: RosterMapping }): Promise<ImportPreview> {
  const l = await lib();
  const imp = await ownImport(l, l.db, input.collegeId, input.importId);
  if (imp.status !== "previewed") throw settled(imp.status);
  if (!isStored(imp.rows)) throw new ImportError("This import cannot be remapped. Upload the file again.", 409);
  const table = toTable(imp.rows);
  const bad = validateMapping(input.mapping, table[0].length);
  if (bad) throw new ImportError(bad, 400);
  const parsed = parseRosterTable(table, input.mapping);
  const c = await classify(l, l.db, input.collegeId, parsed);
  const I = l.schema.collegeRosterImports;
  const [saved] = await l.db
    .update(I)
    .set({ mapping: parsed.mapping, rows: storedFrom(c.rows, table) as unknown[], counts: c.counts as unknown as Record<string, number>, overAllocation: c.alloc.over })
    .where(and(eq(I.id, imp.id), eq(I.status, "previewed")))
    .returning();
  if (!saved) throw settled("changed");
  return previewOf(saved, c.alloc);
}

export async function discardImport(input: { collegeId: string; importId: string }): Promise<void> {
  const l = await lib();
  const I = l.schema.collegeRosterImports;
  const imp = await ownImport(l, l.db, input.collegeId, input.importId);
  if (imp.status !== "previewed") throw settled(imp.status);
  await l.db.update(I).set({ status: "discarded" }).where(and(eq(I.id, imp.id), eq(I.status, "previewed")));
}

export type CommitResult = { created: number; updated: number; autoLinked: number; review: number; skippedInvalid: number };

/**
 * Write the file's valid rows. Everything is re-classified inside the transaction (accounts and the
 * roster move between preview and confirm), under a row lock so a double click cannot commit twice.
 * Rows an admin already decided (linked / rejected / email) keep their match.
 */
export async function commitImport(input: { collegeId: string; importId: string; adminId: string; allowOverAllocation?: boolean }): Promise<CommitResult> {
  const l = await lib();
  const { db, schema } = l;
  const R = schema.collegeRoster;
  const result = await db.transaction(async (tx) => {
    const imp = await ownImport(l, tx, input.collegeId, input.importId, true);
    if (imp.status !== "previewed") throw settled(imp.status);
    if (!isStored(imp.rows)) throw new ImportError("This import cannot be committed. Upload the file again.", 409);
    if (imp.mapping.email < 0) throw new ImportError("Choose the column that holds the email first.", 400);
    const parsed = parseRosterTable(toTable(imp.rows), imp.mapping);
    const c = await classify(l, tx, input.collegeId, parsed);
    if (c.alloc.over && !input.allowOverAllocation) {
      throw new ImportError(`This puts the roster at ${c.alloc.rosterAfter} students, above the ${c.alloc.paidSeats} paid seats. Confirm to import anyway.`, 409);
    }
    const toWrite = parsed.rows.map((r) => ({ r, m: c.matches.get(r.email) ?? ({ kind: "unmatched" } as MatchResult) }));
    const keep = (col: unknown) => sql`CASE WHEN ${R.matchStatus} IN ('linked','rejected','email') THEN ${col} ELSE`;
    for (const part of chunks(toWrite, 500)) {
      await tx
        .insert(R)
        .values(
          part.map(({ r, m }) => ({
            collegeId: input.collegeId,
            email: r.email,
            name: r.name,
            rollNo: r.rollNo,
            year: r.year,
            branch: r.branch,
            phone: r.phone,
            importId: imp.id,
            matchedUserId: m.kind === "email" ? m.userId : null,
            matchStatus: m.kind === "email" ? "email" : m.kind === "review" ? "review" : "unmatched",
            matchCandidates: m.kind === "review" ? m.candidates : [],
          })),
        )
        .onConflictDoUpdate({
          target: [R.collegeId, R.email],
          set: {
            name: sql`coalesce(nullif(excluded.name, ''), ${R.name})`,
            rollNo: sql`coalesce(excluded.roll_no, ${R.rollNo})`,
            year: sql`coalesce(excluded.year, ${R.year})`,
            branch: sql`coalesce(excluded.branch, ${R.branch})`,
            phone: sql`coalesce(excluded.phone, ${R.phone})`,
            importId: sql`excluded.import_id`,
            matchedUserId: sql`${keep(R.matchedUserId)} excluded.matched_user_id END`,
            matchStatus: sql`${keep(R.matchStatus)} excluded.match_status END`,
            matchCandidates: sql`${keep(R.matchCandidates)} excluded.match_candidates END`,
          },
        });
    }
    await tx
      .update(schema.collegeRosterImports)
      .set({ status: "committed", committedAt: sql`now()`, counts: c.counts as unknown as Record<string, number> })
      .where(eq(schema.collegeRosterImports.id, imp.id));
    return {
      created: c.counts.valid,
      updated: c.counts.update,
      autoLinked: c.counts.matchedEmail,
      review: c.counts.review,
      skippedInvalid: c.counts.invalid + c.counts.duplicate,
    } satisfies CommitResult;
  });

  const { verifyFromRoster } = await import("./membership");
  await verifyFromRoster(input.collegeId);
  await l.recordAdminAudit(db, { adminId: input.adminId, action: "roster.import_commit", targetType: "college", targetId: input.collegeId, meta: { importId: input.importId, ...result } });
  if (result.autoLinked > 0) {
    await l.recordAdminAudit(db, { adminId: input.adminId, action: "roster.match_auto", targetType: "college", targetId: input.collegeId, meta: { importId: input.importId, count: result.autoLinked } });
  }
  return result;
}

/** Admin decision on one roster row in the review queue. */
export async function decideMatch(input: { collegeId: string; rosterId: string; adminId: string; action: "link"; userId: string } | { collegeId: string; rosterId: string; adminId: string; action: "reject" }): Promise<{ matchStatus: string }> {
  const l = await lib();
  const { db, schema } = l;
  const R = schema.collegeRoster;
  const [row] = await db.select().from(R).where(and(eq(R.id, input.rosterId), eq(R.collegeId, input.collegeId))).limit(1);
  if (!row) throw new ImportError("Roster row not found", 404);

  if (input.action === "reject") {
    if (row.matchStatus === "email" || row.matchStatus === "linked") throw new ImportError("This student is already linked.", 409);
    await db.update(R).set({ matchStatus: "rejected", matchedUserId: null, matchCandidates: [], matchDecidedBy: input.adminId, matchDecidedAt: sql`now()` }).where(eq(R.id, row.id));
    await l.recordAdminAudit(db, { adminId: input.adminId, action: "roster.match_reject", targetType: "college", targetId: input.collegeId, meta: { rosterId: row.id, email: row.email } });
    return { matchStatus: "rejected" };
  }

  if (row.matchStatus === "email" || row.matchStatus === "linked") throw new ImportError("This student is already linked.", 409);
  const U = schema.users;
  const [user] = await db.select({ id: U.id, role: U.role, phone: U.phoneNumber, email: sql<string>`lower(${U.email})`, verified: U.emailVerified }).from(U).where(eq(U.id, input.userId)).limit(1);
  // Only a candidate the review queue showed, or an intern whose verified email / phone equals the row's.
  const shown = row.matchCandidates.some((c) => c.userId === input.userId) || (user?.verified && user.email === row.email) || Boolean(row.phone && user?.phone === row.phone);
  if (!user || user.role !== "intern" || !shown) throw new ImportError("That student is not a candidate for this row.", 400);
  try {
    await db.update(R).set({ matchStatus: "linked", matchedUserId: user.id, matchCandidates: [], matchDecidedBy: input.adminId, matchDecidedAt: sql`now()` }).where(eq(R.id, row.id));
  } catch (e) {
    const { isUniqueViolation } = await import("@/lib/promo");
    if (isUniqueViolation(e)) throw new ImportError("That student is already linked to another roster row in this college.", 409);
    throw e;
  }
  await l.recordAdminAudit(db, { adminId: input.adminId, action: "roster.match_link", targetType: "college", targetId: input.collegeId, meta: { rosterId: row.id, email: row.email, userId: user.id } });
  return { matchStatus: "linked" };
}

export type ReviewItem = {
  rosterId: string;
  collegeId: string;
  collegeName: string;
  name: string;
  email: string;
  phone: string | null;
  rollNo: string | null;
  candidates: { userId: string; name: string; email: string; emailVerified: boolean; phone: string; reason: "phone" | "name" }[];
};

/** Roster rows waiting for an admin decision, oldest import first; one college or all of them. */
export async function reviewQueue(opts: { collegeId?: string; limit?: number } = {}): Promise<{ items: ReviewItem[]; total: number }> {
  const l = await lib();
  const { db, schema } = l;
  const R = schema.collegeRoster;
  const where = opts.collegeId ? and(eq(R.matchStatus, "review"), eq(R.collegeId, opts.collegeId)) : eq(R.matchStatus, "review");
  const [[t], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(R).where(where),
    db
      .select({ r: R, collegeName: schema.colleges.name })
      .from(R)
      .innerJoin(schema.colleges, eq(schema.colleges.id, R.collegeId))
      .where(where)
      .orderBy(R.createdAt, R.id)
      .limit(opts.limit ?? 100),
  ]);
  const ids = [...new Set(rows.flatMap(({ r }) => r.matchCandidates.map((c) => c.userId)))];
  const U = schema.users;
  const users = ids.length ? await db.select({ id: U.id, first: U.firstName, last: U.lastName, email: U.email, verified: U.emailVerified, phone: U.phoneNumber }).from(U).where(inArray(U.id, ids)) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    total: t?.n ?? 0,
    items: rows.map(({ r, collegeName }) => ({
      rosterId: r.id,
      collegeId: r.collegeId,
      collegeName,
      name: r.name,
      email: r.email,
      phone: r.phone,
      rollNo: r.rollNo,
      candidates: r.matchCandidates.flatMap((c) => {
        const u = byId.get(c.userId);
        return u ? [{ userId: u.id, name: `${u.first} ${u.last}`.trim(), email: u.email, emailVerified: u.verified, phone: u.phone, reason: c.reason }] : [];
      }),
    })),
  };
}
