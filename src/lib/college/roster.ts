/**
 * Roster CSV parsing. Colleges send whatever their ERP exports, so headers
 * are matched loosely ("Email ID", "e-mail", "Student Email" all work) and
 * only email is required. Pure, so it is unit tested.
 */

export type RosterInput = {
  email: string;
  name: string;
  rollNo: string | null;
  year: number | null;
  branch: string | null;
  /** Normalised 10-digit Indian mobile, or null. */
  phone: string | null;
};

/** Column indexes the admin can override. `name` is -1 when the file has no name column. */
export type RosterMapping = { name: number; email: number; phone: number | null };

type Columns = Record<keyof RosterInput, number>;

const HEADERS: Record<keyof RosterInput, RegExp> = {
  email: /e-?mail(\s*(id|address))?/i,
  name: /^(student\s*)?(full\s*)?name$|^name\s*of\s*student$|full\s*name/i,
  rollNo: /roll|enrol+ment|reg(istration)?\.?\s*(no|number|id)|^usn$|^prn$/i,
  year: /^(current\s*)?year(\s*of\s*study)?$|^semester$|^sem$/i,
  branch: /branch|department|dept|specialisation|specialization|stream|program(me)?/i,
  phone: /phone|mobile|contact(\s*no)?/i,
};

/** A parent's or guardian's column is never the student's own. */
const NOT_STUDENT = /parent|father|mother|guardian/i;

function findColumn(header: string[], re: RegExp, own = true): number {
  const i = header.findIndex((h) => re.test(h) && !(own && NOT_STUDENT.test(h)));
  return i >= 0 ? i : header.findIndex((h) => re.test(h));
}

function detectColumns(header: string[]): Columns {
  const col = {} as Columns;
  for (const key of Object.keys(HEADERS) as (keyof RosterInput)[]) col[key] = findColumn(header, HEADERS[key], key === "email" || key === "name" || key === "phone");
  return col;
}

/** The mapping the header suggests (email is -1 when no column looks like one). */
export function detectMapping(header: string[]): RosterMapping {
  const c = detectColumns(header.map((h) => h.trim()));
  return { name: c.name, email: c.email, phone: c.phone >= 0 ? c.phone : null };
}

/**
 * A 10-digit Indian mobile from "98765 43210", "+91-98765-43210", "09876543210" or "919876543210".
 * Null when it isn't one (must start 6-9).
 */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** ";" when the header line has more semicolons than commas and tabs (European-locale Excel exports). */
export function detectSemicolon(text: string): boolean {
  const header = (text.replace(/^﻿/, "").split(/\r\n|\n|\r/)[0] ?? "").replace(/"[^"]*"/g, "");
  const count = (ch: string) => header.split(ch).length - 1;
  return count(";") > count(",") + count("\t");
}

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function splitCsv(text: string): string[][] {
  const semi = detectSemicolon(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (semi ? c === ";" : c === "," || c === "\t") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** "3", "3rd", "III", "Third year", or a semester 5/6 → 3. */
export function readYear(raw: string, isSemester = false): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
  const words: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, final: 4, fifth: 5 };
  let n: number | null = null;
  const digit = s.match(/\d+/);
  if (digit) n = Number(digit[0]);
  else if (roman[s.split(/\s/)[0]]) n = roman[s.split(/\s/)[0]];
  else {
    const w = Object.keys(words).find((k) => s.startsWith(k));
    if (w) n = words[w];
  }
  if (n === null) return null;
  if (isSemester) n = Math.ceil(n / 2);
  return n >= 1 && n <= 5 ? n : null;
}

const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

export type RosterRowResult = {
  /** 1-based line in the file; the header is line 1. */
  line: number;
  name: string;
  email: string;
  phone: string;
  status: "valid" | "invalid" | "duplicate";
  /** A sentence the admin can act on. */
  reason?: string;
  input?: RosterInput;
};

export type ParsedRoster = {
  header: string[];
  mapping: RosterMapping;
  results: RosterRowResult[];
  rows: RosterInput[];
  /** One sentence per rejected row, "Row N: ...", plus any file-level problem. */
  errors: string[];
};

const emptyParsed = (error: string, header: string[] = [], mapping: RosterMapping = { name: -1, email: -1, phone: null }): ParsedRoster => ({
  header,
  mapping,
  results: [],
  rows: [],
  errors: [error],
});

/**
 * Classify a table (header row first). `override` replaces the detected name/email/phone columns.
 * Every rejected row is listed with its line and a reason; nothing is silently dropped.
 */
export function parseRosterTable(table: string[][], override?: RosterMapping): ParsedRoster {
  if (table.length < 2) return emptyParsed("The file needs a header row and at least one student.");
  const header = table[0].map((h) => h.trim());
  const col = detectColumns(header);
  if (override) {
    col.name = override.name;
    col.email = override.email;
    col.phone = override.phone ?? -1;
  }
  const mapping: RosterMapping = { name: col.name, email: col.email, phone: col.phone >= 0 ? col.phone : null };
  if (col.email < 0) return emptyParsed('No email column found. Choose which column holds the email, or add a column called "Email".', header, mapping);
  const semester = col.year >= 0 && /sem/i.test(header[col.year] ?? "");

  const seen = new Map<string, number>();
  const results: RosterRowResult[] = [];
  const rows: RosterInput[] = [];
  const errors: string[] = [];
  const cellAt = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const email = cellAt(r, col.email).toLowerCase();
    const name = cellAt(r, col.name).slice(0, 200);
    const rawPhone = cellAt(r, col.phone);
    const base = { line, name, email, phone: rawPhone };
    const reject = (status: "invalid" | "duplicate", reason: string) => {
      results.push({ ...base, status, reason });
      errors.push(`Row ${line}: ${reason}.`);
    };
    if (!email) return reject("invalid", "Missing email");
    if (!EMAIL.test(email)) return reject("invalid", `Email is not valid (${email})`);
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) return reject("invalid", "Phone is not a 10-digit mobile number");
    const first = seen.get(email);
    if (first !== undefined) return reject("duplicate", `Duplicate of line ${first}`);
    seen.set(email, line);
    const input: RosterInput = {
      email,
      name,
      rollNo: cellAt(r, col.rollNo).slice(0, 60) || null,
      year: readYear(cellAt(r, col.year), semester),
      branch: cellAt(r, col.branch).slice(0, 120) || null,
      phone,
    };
    rows.push(input);
    results.push({ ...base, phone: phone ?? "", status: "valid", input });
  });
  return { header, mapping, results, rows, errors };
}

/** CSV/TSV text → rows. The TPO route and the tests use this; the admin import reads the table itself. */
export function parseRoster(text: string, mapping?: RosterMapping): ParsedRoster {
  return parseRosterTable(splitCsv(text), mapping);
}

/** Lower-cased, trimmed, de-duplicated emails; anything that is not an email is dropped. */
export function normalizeEmails(raw: readonly string[]): string[] {
  const out = new Set<string>();
  for (const e of raw) {
    const email = e.trim().toLowerCase();
    if (EMAIL.test(email)) out.add(email);
  }
  return [...out];
}

/**
 * Values to match when removing roster rows: the stored string as sent (trimmed, plus its lower-case form, since
 * imports store lower case). Not validated as an email, so rows saved by the old semicolon bug can still be removed.
 * The caller scopes the delete to its own college.
 */
export function removalEmails(raw: readonly string[]): string[] {
  const out = new Set<string>();
  for (const e of raw) {
    const v = e.trim();
    if (!v) continue;
    out.add(v);
    out.add(v.toLowerCase());
  }
  return [...out];
}
