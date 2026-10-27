/**
 * Roster CSV parsing. Colleges send whatever their ERP exports, so headers
 * are matched loosely ("Email ID", "e-mail", "Student Email" all work) and
 * only email is required. Pure, so it is unit tested.
 */

export type RosterInput = { email: string; name: string; rollNo: string | null; year: number | null; branch: string | null };

const HEADERS: Record<keyof RosterInput, RegExp> = {
  email: /e-?mail/i,
  name: /^(student\s*)?(full\s*)?name$|^name\s*of\s*student$/i,
  rollNo: /roll|enrol+ment|reg(istration)?\.?\s*(no|number|id)|^usn$|^prn$/i,
  year: /^(current\s*)?year(\s*of\s*study)?$|^semester$|^sem$/i,
  branch: /branch|department|dept|specialisation|specialization|stream|program(me)?/i,
};

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function splitCsv(text: string): string[][] {
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
    else if (c === "," || c === "\t") {
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRoster(text: string): { rows: RosterInput[]; errors: string[] } {
  const table = splitCsv(text);
  if (table.length < 2) return { rows: [], errors: ["The file needs a header row and at least one student."] };
  const header = table[0].map((h) => h.trim());
  const col = {} as Record<keyof RosterInput, number>;
  for (const key of Object.keys(HEADERS) as (keyof RosterInput)[]) {
    col[key] = header.findIndex((h) => HEADERS[key].test(h));
  }
  if (col.email < 0) return { rows: [], errors: ["No email column found. Add a column called \"Email\"."] };
  const semester = col.year >= 0 && /sem/i.test(header[col.year]);

  const seen = new Set<string>();
  const rows: RosterInput[] = [];
  const errors: string[] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const email = (r[col.email] ?? "").trim().toLowerCase();
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
    });
  });
  return { rows, errors };
}
