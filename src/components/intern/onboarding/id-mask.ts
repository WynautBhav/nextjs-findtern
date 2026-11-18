/** What the form may know about an identity number already on file: a masked form, never the number. */
export type IdOnFile = { aadhaar: string | null; pan: string | null };

export const NO_ID_ON_FILE: IdOnFile = { aadhaar: null, pan: null };

const squash = (v: unknown) => (typeof v === "string" ? v.replace(/\s/g, "") : "");

/** "XXXX XXXX 0123". Empty stays null; a value of the wrong shape shows no digits at all. */
export function maskAadhaar(value: unknown): string | null {
  const v = squash(value);
  if (!v) return null;
  return /^\d{12}$/.test(v) ? `XXXX XXXX ${v.slice(-4)}` : "XXXX XXXX XXXX";
}

/** "ABXXXXX34F". Empty stays null; a value of the wrong shape shows no characters at all. */
export function maskPan(value: unknown): string | null {
  const v = squash(value).toUpperCase();
  if (!v) return null;
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(v) ? `${v.slice(0, 2)}XXXXX${v.slice(-3)}` : "XXXXXXXXXX";
}

/** Server side: the masked display for each stored number, so the number itself never rides in the page payload. */
export function idOnFileOf(d: { aadhaarNumber?: string | null; panNumber?: string | null }): IdOnFile {
  return { aadhaar: maskAadhaar(d.aadhaarNumber), pan: maskPan(d.panNumber) };
}

/** Same draft with both numbers blanked: the stored ones stay on the server and win the merge when the key is absent. */
export function withoutIdNumbers<T extends { aadhaarNumber?: string; panNumber?: string }>(d: T): T {
  return { ...d, aadhaarNumber: "", panNumber: "" };
}

/** A typed value that is really the mask echoed back (pasted from the placeholder): not a new number. */
const isMask = (v: string | undefined) => Boolean(v) && /x/i.test(v as string) && !/^\d+$/.test(squash(v));

/**
 * Request body: an untouched on-file number (blank, or a mask) is left out, so the server keeps what it stored. A
 * blank with nothing on file still goes (the server then reports it missing).
 */
export function saveBody<T extends { aadhaarNumber?: string; panNumber?: string }>(values: T, onFile: IdOnFile): Omit<T, "aadhaarNumber" | "panNumber"> & Partial<Pick<T, "aadhaarNumber" | "panNumber">> {
  const body = { ...values };
  if (onFile.aadhaar && (!body.aadhaarNumber || isMask(body.aadhaarNumber))) delete body.aadhaarNumber;
  if (onFile.pan && (!body.panNumber || isMask(body.panNumber))) delete body.panNumber;
  return body;
}

/** Validation errors with the number fields cleared when a number is on file and the field was left alone. */
export function clearOnFileErrors(errors: Record<string, string>, values: { aadhaarNumber?: string; panNumber?: string }, onFile: IdOnFile) {
  const out = { ...errors };
  if (onFile.aadhaar && !values.aadhaarNumber) delete out.aadhaarNumber;
  if (onFile.pan && !values.panNumber) delete out.panNumber;
  return out;
}
