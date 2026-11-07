import { isXlsx, readXlsxRows } from "../../xlsx.ts";
import { splitCsv } from "../../college/roster.ts";

/** Rows of strings from an .xlsx or CSV upload (BOM, quotes and ; delimiter handled by the existing readers). */
export function readRosterRows(bytes: Uint8Array): string[][] {
  if (isXlsx(bytes)) return readXlsxRows(bytes);
  return splitCsv(new TextDecoder("utf-8").decode(bytes));
}
