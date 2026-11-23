/**
 * Aadhaar and PAN lock once saved (owner, 23 Nov: "so we at least know they get saved"). The intern sees them as saved and
 * read-only; the server refuses a different number or a replacement card image. Admin corrections go through the admin
 * tools, not these intern routes.
 */

export const ID_LOCKED_MESSAGE = "Saved and locked. To change it, write to us.";

const WELL_FORMED = { aadhaarNumber: /^\d{12}$/, panNumber: /^[A-Z]{5}\d{4}[A-Z]$/ } as const;

const squash = (v: unknown) => (typeof v === "string" ? v.replace(/\s/g, "").toUpperCase() : "");

/** The first ID number field the intern is trying to change from a saved value, or null. Same value or blank is no change. */
export function lockedIdField(
  stored: { aadhaarNumber?: string | null; panNumber?: string | null } | null | undefined,
  body: { aadhaarNumber?: string; panNumber?: string },
): "aadhaarNumber" | "panNumber" | null {
  for (const key of ["aadhaarNumber", "panNumber"] as const) {
    const was = squash(stored?.[key]);
    const now = squash(body[key]);
    // Only a well-formed saved number locks: a malformed legacy one must stay correctable.
    if (was && now && was !== now && WELL_FORMED[key].test(was)) return key;
  }
  return null;
}

/** Whether an Aadhaar or PAN card image is already on file, so a new upload of that kind is refused. */
export function cardImageLocked(kind: string, doc: { aadhaarImageName?: string | null; panImageName?: string | null } | null | undefined): boolean {
  if (kind === "aadhaar") return Boolean(doc?.aadhaarImageName);
  if (kind === "pan") return Boolean(doc?.panImageName);
  return false;
}
