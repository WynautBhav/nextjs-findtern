/**
 * Phone number rules, shared by the signup forms, the signup APIs, the zod
 * schemas and the admin contact editor so a number accepted in one place is
 * never rejected in another.
 *
 * Indian mobiles: exactly 10 digits, first digit 6-9 (TRAI numbering plan).
 * Everything else: 6 to 15 digits (E.164 national part). Both reject the
 * obvious junk people type to get past a form - one repeated digit, or a
 * straight run like 1234567890.
 */

export const INDIA_CODE = "+91";

export function normalizePhone(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function isJunk(digits: string): boolean {
  if (/^(\d)\1+$/.test(digits)) return true;
  const asc = "01234567890123456789";
  const desc = "98765432109876543210";
  return asc.includes(digits) || desc.includes(digits);
}

/** Returns an error message, or null when the number is acceptable. */
export function phoneError(countryCode: string, raw: string): string | null {
  const digits = normalizePhone(raw);
  const code = String(countryCode ?? "").trim() || INDIA_CODE;
  if (!/^\+\d{1,4}$/.test(code)) return "Invalid country code";

  if (code === INDIA_CODE) {
    if (digits.length !== 10) return "Indian numbers must be 10 digits";
    if (!/^[6-9]/.test(digits)) return "Indian mobile numbers start with 6, 7, 8 or 9";
  } else if (digits.length < 6 || digits.length > 15) {
    return "Phone number must be 6 to 15 digits";
  }

  if (isJunk(digits)) return "Please enter a real phone number";
  return null;
}

/**
 * `phoneError` for a number being saved over one already on file: an
 * unchanged number passes, so an account created under an older rule (an
 * Indian number starting 0-5, say) can still save the rest of its profile
 * (EMH-46). A new or edited number gets the full check.
 */
export function phoneChangeError(
  countryCode: string,
  raw: string,
  stored: { countryCode?: string | null; phone?: string | null },
): string | null {
  const sameCode = String(countryCode ?? "").trim() === String(stored.countryCode ?? "").trim();
  const storedDigits = normalizePhone(stored.phone ?? "");
  if (sameCode && storedDigits && normalizePhone(raw) === storedDigits) return null;
  return phoneError(countryCode, raw);
}

export function isValidPhone(countryCode: string, raw: string): boolean {
  return phoneError(countryCode, raw) === null;
}

export function phoneHint(countryCode: string): string {
  return countryCode === INDIA_CODE
    ? "10 digits starting with 6-9, no country code."
    : "6 to 15 digits, no country code.";
}
