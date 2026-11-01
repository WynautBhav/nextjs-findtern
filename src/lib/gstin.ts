/**
 * GSTIN shape: 2-digit state code, 10-character PAN, entity number, the letter
 * Z, a check character. Format only (no checksum): the invoice reads the state
 * code to choose CGST + SGST or IGST, so a typo here changes the tax split.
 * The server also checks the state code is a real one (`stateCodeFromGstin`).
 */
export const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const GSTIN_HINT = "Enter a valid 15-character GSTIN, like 27AAPFU0939F1ZV.";

export function isGstinFormat(raw: string | null | undefined): boolean {
  return GSTIN_FORMAT.test(String(raw ?? "").trim().toUpperCase());
}
