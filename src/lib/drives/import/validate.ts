import type { Mapping } from "./headers.ts";
import { normaliseEmail, normaliseName, normalisePhoneE164 } from "./normalize.ts";

export type EntryState = "valid" | "invalid" | "duplicate" | "ambiguous" | "over_allocation";
export type RosterRow = { rowNo: number; name: string; email: string | null; phone: string | null; state: EntryState; reasons: string[] };

/** rowNo is 1-based position among data rows (header excluded). */
export function validateRows(data: readonly (readonly string[])[], mapping: Mapping, remainingSlots: number): RosterRow[] {
  const cell = (r: readonly string[], i: number | undefined) => (i === undefined ? "" : (r[i] ?? ""));
  const seen = new Set<string>();
  let used = 0;
  const slots = Math.max(0, Math.floor(remainingSlots));
  return data.map((r, i) => {
    const name = normaliseName(cell(r, mapping.name));
    const email = normaliseEmail(cell(r, mapping.email));
    const rawPhone = cell(r, mapping.phone).trim();
    const phone = rawPhone ? normalisePhoneE164(rawPhone) : null;
    const reasons: string[] = [];
    if (!name) reasons.push("name_missing");
    if (!email) reasons.push("email_invalid");
    if (rawPhone && !phone) reasons.push("phone_invalid");
    let state: EntryState = "valid";
    if (!name || !email || (rawPhone && !phone)) state = "invalid";
    else if (seen.has(email)) {
      state = "duplicate";
      reasons.push("duplicate_email_in_file");
    } else {
      seen.add(email);
      if (used >= slots) {
        state = "over_allocation";
        reasons.push("over_allocation");
      } else used++;
    }
    return { rowNo: i + 1, name, email, phone, state, reasons };
  });
}
