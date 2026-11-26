/**
 * The employers a placement officer invites to a drive, read from a CSV (Name, Company name, Email, Phone).
 * Headers are matched loosely like the roster import ("Company", "Organisation", "E-mail", "Mobile" all work), the
 * same parser reads the file, and the same rules as the drive API judge each row, so a row that passes here passes
 * there. Pure, so it is unit tested. The server still validates everything again (drive-input.ts).
 */

import { DIAL_CODES } from "../data/dial-codes.ts";
import { INDIA_CODE, normalizePhone, phoneError } from "../phone.ts";
import { readPhone, splitCsv } from "./roster.ts";

export type InviteRow = { name: string; company: string; email: string; phone: string };

/** The drive API takes at most this many companies. */
export const MAX_INVITES = 50;
/** A CSV of 50 employers is a few KB; anything bigger is the wrong file. */
export const MAX_IMPORT_BYTES = 200 * 1024;
/** Rows read from a file before the sheet is refused: stops a huge export from locking the tab. */
const MAX_SCAN_ROWS = 1000;

const HEADERS = {
  company: /company|organi[sz]ation|firm/i,
  email: /e-?mail/i,
  phone: /phone|mobile|contact\s*(no|number)|whats\s*app|^cell$/i,
  name: /name|contact|person|^hr\b/i,
} as const;

const INVISIBLE = /[\p{Cf}\p{Cc}]/gu;
const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;
const clean = (s: string) => s.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();

/** No number: empty, or only the country code picked in the builder ("+44 "). */
export function isBlankPhone(raw: string | undefined): boolean {
  return /^(\+\d{1,4})?$/.test((raw ?? "").trim());
}

/** Known dialling codes, longest first, so "+971…" is read as +971 before +97 or +9. */
const CODES = [...new Set(DIAL_CODES.map((d) => d.code))].sort((a, b) => b.length - a.length);

/** A number written with a non-Indian country code: "+44 7700 900123", "+1 (415) 555-0134" or "+971501234567". Null for India or no "+". */
function foreignPhone(s: string): { code: string; rest: string } | null {
  const spaced = /^[\s(]*\+(\d{1,4})\)?[\s-]+(.+)$/.exec(s);
  if (spaced) return `+${spaced[1]}` === INDIA_CODE ? null : { code: `+${spaced[1]}`, rest: spaced[2] };
  const joined = /^[\s(]*\+(\d+)$/.exec(s.replace(/[\s\-().]/g, ""));
  if (!joined || joined[1].startsWith("91")) return null;
  const code = CODES.find((c) => `+${joined[1]}`.startsWith(c));
  return code ? { code, rest: `+${joined[1]}`.slice(code.length) } : { code: "+?", rest: "" };
}

/**
 * The company phone, or the reason it is not one. Blank is fine: the phone is optional. An Indian mobile (any common
 * way of writing it) is its 10 digits, as stored before country codes; another country's is "+CC digits" (bug sheet
 * 25 Nov), checked by the same rule as signup.
 */
export function invitePhone(raw: string | undefined): { phone: string | null; error: string | null } {
  const s = (raw ?? "").trim();
  if (isBlankPhone(s)) return { phone: null, error: null };
  const foreign = foreignPhone(s);
  if (foreign) {
    if (!CODES.includes(foreign.code)) return { phone: null, error: "Check the country code" };
    if (/[^\d\s\-().]/.test(foreign.rest)) return { phone: null, error: "Check the phone number" };
    // A trunk 0 written after the country code ("+44 07700 900123") is not dialled from abroad.
    const digits = normalizePhone(foreign.rest).replace(/^0/, "");
    const bad = phoneError(foreign.code, digits);
    return bad ? { phone: null, error: bad } : { phone: `${foreign.code} ${digits}`, error: null };
  }
  const digits = readPhone(s);
  const bad = digits === null ? "Check the phone number: 10 digits, starting with 6 to 9" : phoneError(INDIA_CODE, digits);
  return bad ? { phone: null, error: bad } : { phone: digits, error: null };
}

/** The builder's two controls for a stored or typed phone: its country code (+91 when none) and the rest. */
export function splitInvitePhone(raw: string | undefined): { code: string; number: string } {
  const s = (raw ?? "").trimStart(); // the space after a picked code is kept: "+44 " is the code with no number yet
  // Only a code followed by a space is split off ("+44 7700…", or "+44 " with no number yet): while "+4" is being typed it
  // stays whole in the number box, so typing an international number in full is never cut short.
  const m = /^\+(\d{1,4})\s+(.*)$/.exec(s);
  return m && `+${m[1]}` !== INDIA_CODE ? { code: `+${m[1]}`, number: m[2] } : { code: INDIA_CODE, number: s.replace(/^\+91\s*/, "") };
}

/** Back to one string for the row: India as typed (read as 10 digits), another code in front of the number. */
export function joinInvitePhone(code: string, number: string): string {
  if (code === INDIA_CODE) return number.trim() ? number : "";
  return `${code} ${number.trim() ? number : ""}`;
}

/** Why a row can't be sent as it stands, with the field to point at. Fully blank rows are not problems: they are ignored. */
export function inviteRowProblem(r: InviteRow): { field: "company" | "email" | "phone"; message: string } | null {
  if (!r.company.trim() && !r.email.trim() && !r.name.trim() && isBlankPhone(r.phone)) return null;
  if (!clean(r.company)) return { field: "company", message: "Name the company" };
  const email = r.email.trim();
  if (!EMAIL.test(email) || email.length > 200) return { field: "email", message: "Check the company email" };
  const phone = invitePhone(r.phone);
  if (phone.error) return { field: "phone", message: phone.error };
  return null;
}

/** A row ready for the API: trimmed, lower-case email, phone as its 10 digits. */
export function toApiRow(r: InviteRow): { company: string; email: string; name: string; phone: string } {
  return { company: clean(r.company), email: r.email.trim().toLowerCase(), name: clean(r.name), phone: invitePhone(r.phone).phone ?? "" };
}

export function parseInviteSheet(text: string): { rows: InviteRow[]; errors: string[] } {
  const table = splitCsv(text);
  if (table.length < 2) return { rows: [], errors: ["The file needs a header row and at least one employer."] };
  if (table.length > MAX_SCAN_ROWS) return { rows: [], errors: [`The file has more than ${MAX_SCAN_ROWS} rows. A drive takes at most ${MAX_INVITES} employers.`] };
  const header = table[0].map((h) => clean(h));
  const col = { company: -1, email: -1, phone: -1, name: -1 };
  // Most specific first, each column used once: "Company name" is the company, not the person's name.
  const taken = new Set<number>();
  for (const key of ["email", "phone", "company", "name"] as const) {
    const at = header.findIndex((h, i) => !taken.has(i) && HEADERS[key].test(h));
    if (at >= 0) {
      col[key] = at;
      taken.add(at);
    }
  }
  if (col.email < 0) return { rows: [], errors: ['No email column found. Add a column called "Email".'] };
  if (col.company < 0) return { rows: [], errors: ['No company column found. Add a column called "Company name".'] };

  const seen = new Set<string>();
  const rows: InviteRow[] = [];
  const errors: string[] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const cell = (k: keyof typeof col) => (col[k] >= 0 ? clean(r[col[k]] ?? "") : "");
    const row: InviteRow = { name: cell("name").slice(0, 120), company: cell("company").slice(0, 120), email: cell("email").toLowerCase(), phone: cell("phone") };
    if (!row.company && !row.email && !row.name && !row.phone) return;
    const bad = inviteRowProblem(row);
    if (bad?.field === "phone") {
      // Like the roster import: the employer is kept, the number is not.
      errors.push(`Row ${line}: "${row.phone.slice(0, 20)}" is not a valid phone number; left blank.`);
      row.phone = "";
    } else if (bad) {
      errors.push(`Row ${line}: ${bad.field === "email" ? `"${row.email || "(blank)"}" is not an email address` : "no company name"}; skipped.`);
      return;
    }
    if (seen.has(row.email)) {
      errors.push(`Row ${line}: ${row.email} appears twice; kept the first.`);
      return;
    }
    seen.add(row.email);
    rows.push(row);
  });
  return { rows, errors };
}

/**
 * Add imported rows to the list already on screen. Blank rows are dropped, an email already listed is skipped (the typed
 * row wins), and the list never grows past MAX_INVITES; what did not fit is counted.
 */
export function mergeInvites(current: InviteRow[], incoming: InviteRow[]): { rows: InviteRow[]; added: number; duplicates: number; overflow: number } {
  const rows = current.filter((r) => r.company.trim() || r.email.trim() || r.name.trim() || !isBlankPhone(r.phone));
  const have = new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean));
  let added = 0;
  let duplicates = 0;
  let overflow = 0;
  for (const r of incoming) {
    if (have.has(r.email)) {
      duplicates++;
      continue;
    }
    if (rows.length >= MAX_INVITES) {
      overflow++;
      continue;
    }
    have.add(r.email);
    rows.push(r);
    added++;
  }
  return { rows, added, duplicates, overflow };
}

/** The sample file offered next to "Import file" (26 Nov): the columns the importer reads, with two made-up employers. */
export const INVITE_SAMPLE_CSV = "Name,Company name,Email,Phone\r\nPriya Sharma,Acme Analytics,priya@acme.example.com,+91 9811122334\r\nRahul Verma,Northwind Labs,hr@northwind.example.com,9822233445\r\n";
