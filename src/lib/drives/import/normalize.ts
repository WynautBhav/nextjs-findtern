/** Pure normalisers for drive roster rows. */

const EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[a-z]{2,}$/;
const JUNK = new Set(["na", "n/a", "null", "none", "-", "nil", "test"]);

export function normaliseEmail(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  if (!e || JUNK.has(e) || e.length > 254 || e.includes("..")) return null;
  const at = e.indexOf("@");
  if (at < 1 || e.lastIndexOf("@") !== at || e.startsWith(".") || e.slice(0, at).endsWith(".")) return null;
  return EMAIL.test(e) ? e : null;
}

/** Indian mobile → "+91XXXXXXXXXX"; anything else null. */
export function normalisePhoneE164(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/[\s\-().]/g, "");
  if (/[^\d+]/.test(d) || d.indexOf("+") > 0) return null;
  if (d.startsWith("+")) {
    if (!d.startsWith("+91")) return null;
    d = d.slice(3);
  } else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  else if (d.length === 12 && d.startsWith("091")) d = d.slice(3);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** Display name: trimmed, whitespace collapsed. */
export function normaliseName(raw: unknown): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

/** Comparison key only: diacritics stripped, case-folded. Never store this. */
export function nameKey(raw: unknown): string {
  return normaliseName(raw).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
