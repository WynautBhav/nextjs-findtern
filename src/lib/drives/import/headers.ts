export type RosterField = "name" | "email" | "phone";

const SYNONYMS: Record<RosterField, string[]> = {
  name: ["name", "full name", "student name", "name of student", "student full name", "candidate name"],
  email: ["email", "e-mail", "email id", "college email", "official email", "college email id", "student email", "institute email"],
  phone: ["phone", "mobile", "contact", "phone number", "mobile number", "contact number", "mobile no", "phone no", "contact no"],
};

const clean = (h: string) => h.normalize("NFKC").toLowerCase().replace(/[_.]/g, " ").replace(/\s+/g, " ").trim();

export type Mapping = Partial<Record<RosterField, number>>;

/** Column index per field by exact synonym match; first column wins; a column is used for one field only. */
export function suggestedMapping(headers: readonly string[]): Mapping {
  const out: Mapping = {};
  const used = new Set<number>();
  for (const field of ["email", "name", "phone"] as RosterField[]) {
    const idx = headers.findIndex((h, i) => !used.has(i) && SYNONYMS[field].includes(clean(h)));
    if (idx >= 0) {
      out[field] = idx;
      used.add(idx);
    }
  }
  return out;
}

/** Picks the header row (first row that maps an email column) so title rows above are skipped. */
export function detectHeaderRow(rows: readonly (readonly string[])[], scan = 10): number {
  for (let i = 0; i < Math.min(rows.length, scan); i++) if (suggestedMapping(rows[i]).email !== undefined) return i;
  return -1;
}
