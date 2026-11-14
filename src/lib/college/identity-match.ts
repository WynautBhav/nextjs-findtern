import { normaliseEmail } from "../drives/import/normalize.ts";

/**
 * Pure rules for the college-account promo redemption (WP4): does the student at the keyboard match what
 * their college gave Findtern, and which kind of code did they type. No DB, no Next imports.
 *
 * The college's own details are the proof. A promo code on its own is never enough, and a matching
 * identity on its own is never enough; the server needs both, and says only "could not verify" when
 * either is missing (COLLEGE_PROMO_FAIL), never which one.
 */

/** The one answer for every refusal that could teach a prober something: no code, wrong code, used code, other college, any identity mismatch. */
export const COLLEGE_PROMO_FAIL =
  "We could not verify that promo code for your account. Check the code with your placement office, and ask them to confirm the name, phone number and email they gave Findtern.";

// ── Fields ───────────────────────────────────────────────────────────────────────────────────────────────

/** Email key: trimmed, lower-cased, one "@", a real domain. Null when it is not usable. */
export function emailKey(raw: unknown): string | null {
  return normaliseEmail(raw);
}

/**
 * Phone key: the last 10 digits. "+91 98765-43210", "09876543210", "919876543210" and "9876543210" are one number.
 * `countryCode` is the student's registered code; anything but 91 cannot match an Indian roster number, so it is null.
 * Fewer than 10 digits is not a number.
 */
export function phoneKey(raw: unknown, countryCode?: unknown): string | null {
  if (countryCode !== undefined && countryCode !== null && String(countryCode).trim() !== "") {
    if (String(countryCode).replace(/\D/g, "") !== "91") return null;
  }
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Titles that are written on one list and not the other. Not "kumari" or "kumar": those are names. */
const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "shri", "smt"]);

/**
 * Comparable tokens of a name: format characters (zero-width) removed, compatibility and diacritics folded,
 * lower-cased, every non-letter/digit/mark (dots, commas, hyphens, apostrophes, slashes) is a space, titles and
 * single Latin initials are dropped. Order is not kept. Works on any script ("राहुल शर्मा", "José Núñez").
 */
export function nameTokens(raw: unknown): string[] {
  const s = String(raw ?? "")
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
  if (!s) return [];
  return s.split(" ").filter((t) => t && !TITLES.has(t) && !/^[a-z]$/.test(t));
}

/**
 * Names match when, after the folding above, either
 *  1. they have the same words in any order ("Sharma Rahul" = "rahul  sharma" = "Rahul Sharma."), or
 *  2. one side has at least two words and every one of them is on the other side (a middle or second name
 *     written on one list only: "Rahul Sharma" = "Rahul Kumar Sharma").
 * Deliberately not tolerated: spelling differences, nicknames, a single shared word, a one-word name against a
 * longer one, an empty name. A student turned away by that fixes the list or switches to an individual account;
 * a wrong match would have a stranger spending a college's seat.
 */
export function namesMatch(a: unknown, b: unknown): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const sa = new Set(ta);
  const sb = new Set(tb);
  if (sa.size === sb.size && [...sa].every((t) => sb.has(t))) return true;
  const [small, large] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  return small.size >= 2 && [...small].every((t) => large.has(t));
}

// ── Identity ─────────────────────────────────────────────────────────────────────────────────────────────

/** What the college gave Findtern: a drive roster row (name, email, phone) or a college roster row (name, email; no phone). */
export type RosterIdentity = { name: string; email: string; phone: string | null };
/** The signed-in student. `emailVerified`: the inbox was proved at signup. The phone is as typed, not verified. */
export type StudentIdentity = { name: string; email: string; emailVerified: boolean; phone: string | null; countryCode?: string | null };

export type IdentityField = "name" | "email" | "phone";
export type IdentityVerdict = { ok: true } | { ok: false; failed: IdentityField[] };

/**
 * The student is the person on the college's list.
 *  - email: equal after trim/lower-case, and the student's address is a verified one (an unverified address is
 *    a claim anyone can type);
 *  - phone: when the roster row has a phone, the student's must match on the last 10 digits; a roster row without
 *    one is not asked for it (the college roster never has one); a roster phone that cannot be read fails;
 *  - name: always, per `namesMatch`.
 * `failed` is for the audit trail and tests only: it must never reach the student.
 */
export function verifyIdentity(entry: RosterIdentity, student: StudentIdentity): IdentityVerdict {
  const failed: IdentityField[] = [];
  const rosterEmail = emailKey(entry.email);
  const studentEmail = emailKey(student.email);
  if (!rosterEmail || !studentEmail || rosterEmail !== studentEmail || !student.emailVerified) failed.push("email");
  if (entry.phone !== null && String(entry.phone).trim() !== "") {
    const rosterPhone = phoneKey(entry.phone);
    const studentPhone = phoneKey(student.phone, student.countryCode);
    if (!rosterPhone || !studentPhone || rosterPhone !== studentPhone) failed.push("phone");
  }
  if (!namesMatch(entry.name, student.name)) failed.push("name");
  return failed.length === 0 ? { ok: true } : { ok: false, failed };
}

// ── Which code ───────────────────────────────────────────────────────────────────────────────────────────

const DRIVE_ALPHABET = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$/;

export type TypedCode = { kind: "drive"; code: string } | { kind: "promo"; code: string };

/**
 * What was typed, routed by shape: XXXX-XXXX-XXXX (case, spaces and dashes forgiven) is a personal drive code;
 * any other printable string up to 40 characters is tried as the college's promo (TPO) code. Null for empty,
 * too long, control characters or NUL. The shape is not a secret, so a null never touches the database.
 */
export function classifyTypedCode(raw: unknown): TypedCode | null {
  if (typeof raw !== "string") return null;
  const t = raw.normalize("NFKC").trim();
  if (t.length < 4 || t.length > 40 || /[\p{Cc}\p{Cf}]/u.test(t)) return null;
  const compact = t.toUpperCase().replace(/[\s_-]/g, "");
  if (DRIVE_ALPHABET.test(compact)) return { kind: "drive", code: `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}` };
  return { kind: "promo", code: t.toUpperCase().replace(/\s+/g, "") };
}

// ── Decisions ────────────────────────────────────────────────────────────────────────────────────────────

/** Which Home an intern sees. Payment is read from the database by the caller; an unpaid college account never sees money. */
export type CollegeHomeState = "college_unpaid" | "college_paid" | "normal";

export function collegeHomeState(input: { accountType: "individual" | "college" | null; codeVerified: boolean; paid: boolean }): CollegeHomeState {
  if (input.accountType !== "college" || !input.codeVerified) return "normal";
  return input.paid ? "college_paid" : "college_unpaid";
}

/** Switching back to a college account: they were an individual, a code still backs the link, and nothing is paid. */
export function canSwitchBackToCollege(input: { accountType: "individual" | "college" | null; codeVerified: boolean; paid: boolean }): boolean {
  return input.accountType === "individual" && input.codeVerified && !input.paid;
}

/** Any of the college's roster rows for this student proves who they are. */
export function rosterMatches(entries: readonly RosterIdentity[], student: StudentIdentity): boolean {
  return entries.some((e) => verifyIdentity(e, student).ok);
}

export type PromoRefusal = "no_consent" | "no_code" | "not_full_cover" | "other_college" | "no_entry" | "identity" | "entry_taken";
export type PromoDecision = { ok: true } | { ok: false; reason: PromoRefusal; failed?: IdentityField[] };

/**
 * Whether the college's shared promo (TPO) code may waive this student's fee. Every refusal except `no_consent`
 * is shown as COLLEGE_PROMO_FAIL: the reason is for the audit trail only. `hasAdultConsent`: the 18+ tick the student
 * gave with the college code is still on record (the server reads it; the browser sends no consent flag).
 *  - the code is a live code of the student's OWN college (`quote.promo.collegeId` = membership college) and
 *    covers the whole fee (a part-discount belongs to the normal pay flow);
 *  - the college's rosters list this student, and one entry matches name, email and phone as per verifyIdentity.
 */
export function collegePromoDecision(input: {
  hasAdultConsent: boolean;
  quote: { ok: true; promoCollegeId: string | null; payableMinor: number } | { ok: false } | null;
  membershipCollegeId: string | null;
  entries: readonly RosterIdentity[];
  student: StudentIdentity;
}): PromoDecision {
  if (!input.hasAdultConsent) return { ok: false, reason: "no_consent" };
  const q = input.quote;
  if (!q || !q.ok) return { ok: false, reason: "no_code" };
  if (!q.promoCollegeId || q.payableMinor !== 0) return { ok: false, reason: "not_full_cover" };
  if (!input.membershipCollegeId || q.promoCollegeId !== input.membershipCollegeId) return { ok: false, reason: "other_college" };
  if (input.entries.length === 0) return { ok: false, reason: "no_entry" };
  if (!rosterMatches(input.entries, input.student)) return { ok: false, reason: "identity" };
  return { ok: true };
}

/**
 * Whether the student may use this personal drive code: the roster row it was issued to is at the student's own
 * college, is not already linked to someone else, and matches the student's name, email and phone. The code's own
 * state (used, expired, revoked, order unpaid) is judged by redeemDriveCode, in the same transaction, afterwards.
 */
export function driveEntryDecision(input: {
  entry: (RosterIdentity & { collegeId: string; internId: string | null }) | null;
  membershipCollegeId: string | null;
  uid: string;
  student: StudentIdentity;
}): PromoDecision {
  const e = input.entry;
  if (!e) return { ok: false, reason: "no_code" };
  if (!input.membershipCollegeId || e.collegeId !== input.membershipCollegeId) return { ok: false, reason: "other_college" };
  if (e.internId && e.internId !== input.uid) return { ok: false, reason: "entry_taken" };
  const v = verifyIdentity(e, input.student);
  if (!v.ok) return { ok: false, reason: "identity", failed: v.failed };
  return { ok: true };
}
