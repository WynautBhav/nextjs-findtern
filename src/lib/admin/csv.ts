/**
 * CSV serialisation for admin exports.
 *
 * The export button on an admin table has to honour whatever filters are
 * currently applied, otherwise the download and the screen disagree and
 * someone reconciles a CSV against the wrong population.
 *
 * Two failure modes worth naming, both handled below:
 *
 *  1. **Formula injection.** A cell beginning with `=`, `+`, `-` or `@` is
 *     executed by Excel and Sheets on open. An intern registering as
 *     `=HYPERLINK("http://evil","click")` would run in the finance admin's
 *     spreadsheet. Prefixing with `'` neutralises it.
 *  2. **Broken rows.** A value containing a comma, quote or newline must be
 *     quoted, and embedded quotes doubled, or the column count silently drifts
 *     and every row after the offender lands in the wrong column.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

/** Escapes one cell value for CSV. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);

  if (text === "") return "";
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (NEEDS_QUOTING.test(text)) text = `"${text.replace(/"/g, '""')}"`;

  return text;
}

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

/** Builds a full CSV document, header row included. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(","));
  // Excel needs the BOM to read UTF-8, otherwise non-ASCII names export as mojibake.
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

/** A filesystem- and header-safe slug for the download name. */
export function csvFilename(resource: string, stamp = new Date()): string {
  const day = stamp.toISOString().slice(0, 10);
  return `${resource}-${day}.csv`;
}

/** CSV as a downloadable HTTP response. */
export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // Admin exports are per-user and change constantly; never let a proxy
      // or the bfcache hold a stale copy.
      "cache-control": "private, no-store",
    },
  });
}
