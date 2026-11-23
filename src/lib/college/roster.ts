/**
 * Roster CSV parsing. Colleges send whatever their ERP exports, so headers
 * are matched loosely ("Email ID", "e-mail", "Student Email" all work) and
 * only email is required. Pure, so it is unit tested.
 */

export type RosterInput = { email: string; name: string; rollNo: string | null; year: number | null; branch: string | null; phone: string | null };

const HEADERS: Record<keyof RosterInput, RegExp> = {
  email: /e-?mail/i,
  name: /^(student\s*)?(full\s*)?name$|^name\s*of\s*student$/i,
  rollNo: /roll|enrol+ment|reg(istration)?\.?\s*(no|number|id)|^usn$|^prn$/i,
  year: /^(current\s*)?year(\s*of\s*study)?$|^semester$|^sem$/i,
  branch: /branch|department|dept|specialisation|specialization|stream|program(me)?/i,
  phone: /phone|mobile|contact\s*(no|number)|whats\s*app|^cell$/i,
};

/**
 * An Indian mobile as its 10 digits, or null. Accepted shapes: 10 digits, 0 + 10, 91 + 10, 091 + 10, 0091 + 10, +91 0 + 10 (with
 * spaces, dashes, brackets, a leading + or a spreadsheet's ".0" or leading apostrophe). Anything else is not a number
 * we can trust: a +44 number, an 11-digit typo or a decimal is never cut down to its last ten digits.
 */
export function readPhone(raw: string): string | null {
  const s = raw.trim().replace(/^'/, "").replace(/^(\d+)\.0+$/, "$1");
  // A "+" is only ever the first thing (a bracket or space may come before it: "(+91) 98765 43210"), and only once.
  if (/[^\d\s\-().+]/.test(s) || !/^[^+]*$|^[\s(]*\+[^+]*$/.test(s)) return null;
  let d = s.replace(/\D/g, "");
  const plus = s.includes("+");
  if (plus && !d.startsWith("91")) return null;
  if (d.length === 14 && d.startsWith("0091")) d = d.slice(4);
  else if (d.length === 13 && d.startsWith("091")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (plus && d.length === 13 && d.startsWith("910")) d = d.slice(3); // "+91 0 98765 43210": a trunk 0 kept after the country code
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** Bytes of a roster file as text: UTF-8 (BOM dropped), UTF-16 with a BOM, else Windows-1252 (Excel's plain "CSV"). */
export function decodeRosterBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
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
const NOT_THE_STUDENT = /parent|guardian|father|mother|emergency|spouse/i;
/** Zero-width and other format characters (ZWSP, ZWNJ, BOM, bidi marks): invisible in a sheet, fatal in an email match. */
const INVISIBLE = /\p{Cf}/gu;

export function parseRoster(text: string): { rows: RosterInput[]; errors: string[] } {
  const table = splitCsv(text);
  if (table.length < 2) return { rows: [], errors: ["The file needs a header row and at least one student."] };
  const header = table[0].map((h) => h.trim());
  const col = {} as Record<keyof RosterInput, number>;
  for (const key of Object.keys(HEADERS) as (keyof RosterInput)[]) {
    // A parent's or guardian's column (email, mobile, name) is never the student's own.
    col[key] = header.findIndex((h) => HEADERS[key].test(h) && !NOT_THE_STUDENT.test(h));
  }
  if (col.email < 0) return { rows: [], errors: ["No email column found. Add a column called \"Email\"."] };
  const semester = col.year >= 0 && /sem/i.test(header[col.year]);

  const seen = new Set<string>();
  const rows: RosterInput[] = [];
  const errors: string[] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const email = (r[col.email] ?? "").replace(INVISIBLE, "").trim().toLowerCase();
    if (!EMAIL.test(email)) {
      errors.push(`Row ${line}: "${email || "(blank)"}" is not an email address.`);
      return;
    }
    if (seen.has(email)) {
      errors.push(`Row ${line}: ${email} appears twice; kept the first.`);
      return;
    }
    seen.add(email);
    const cell = (k: keyof RosterInput) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    rows.push({
      email,
      name: cell("name").slice(0, 200),
      rollNo: cell("rollNo").slice(0, 60) || null,
      year: readYear(cell("year"), semester),
      branch: cell("branch").slice(0, 120) || null,
      phone: readPhone(cell("phone")),
    });
    if (cell("phone") && !rows[rows.length - 1].phone) errors.push(`Row ${line}: "${cell("phone").slice(0, 20)}" is not a 10-digit mobile number; saved without a phone.`);
  });
  return { rows, errors };
}

/** Lower-cased, trimmed, de-duplicated emails; anything that is not an email is dropped. */
export function normalizeEmails(raw: readonly string[]): string[] {
  const out = new Set<string>();
  for (const e of raw) {
    const email = e.replace(INVISIBLE, "").trim().toLowerCase();
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
