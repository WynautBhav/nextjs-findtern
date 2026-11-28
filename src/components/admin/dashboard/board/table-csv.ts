/**
 * The people window's table and its CSV share one definition: the pinned name column, then the picked columns in
 * their order. Export is exactly what is on screen (the rows passed in: the tab, the search, or the selection).
 * Pure, so the test runs it with `node --test`.
 */

/** The always-shown first column: "Name" for people, "Company" for companies. */
export const PINNED = ["Name", "Company"] as const;

export function pinnedOf(columns: string[]): string | null {
  return columns.find((c) => (PINNED as readonly string[]).includes(c)) ?? null;
}

/** The columns after the pinned one that are switched on, in the table's order. */
export function shownColumns(columns: string[], on: Set<string>): string[] {
  const pin = pinnedOf(columns);
  return columns.filter((c) => c !== pin && on.has(c));
}

/** One cell, safe for a spreadsheet: a leading = + - @ would run as a formula; a phone number is left as it is. */
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  const safe = /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s()-]+$/.test(s)) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Header + rows for the CSV: exactly the table's columns, for exactly the rows given. */
export function tableCsv(columns: string[], on: Set<string>, rows: { csv: Record<string, string | number | null> }[]): string[][] {
  const pin = pinnedOf(columns);
  const head = [...(pin ? [pin] : []), ...shownColumns(columns, on)];
  return [head, ...rows.map((r) => head.map((c) => csvCell(r.csv[c] ?? "")))];
}

export function csvText(table: string[][]): string {
  return "﻿" + table.map((r) => r.join(",")).join("\r\n");
}
