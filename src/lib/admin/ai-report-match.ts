/**
 * Matching an Incruiter feedback PDF to a Findtern candidate.
 *
 * The report's first page opens with a header block:
 *
 *   Ayush Sinha
 *   #CAN00269            0% Resume Match
 *   Anudip-1 • Findtern Private Limited
 *   ayush21052003@gmail.com • +916202996007
 *   Wed, Sep 9, 2026 49 mins 37 secs
 *
 * `parseReportHeader` reads the name, Incruiter candidate id, email and phone
 * from those lines. `matchHeader` then decides, against candidates the caller
 * already looked up, whether the file belongs to exactly one of them.
 *
 * A report is only auto-matched when the PHONE agrees and so does the email or
 * the name. A phone alone is not enough (a re-used SIM, a typo in either
 * system) and a name alone never is. Everything else is a "check": a person
 * confirms it before anything is published, because the file ends up in front
 * of an employer.
 *
 * Pure and dependency-free so it runs under `node --test`.
 */

export type ReportHeader = {
  name: string | null;
  /** Incruiter's candidate id, e.g. "CAN00269". */
  canId: string | null;
  email: string | null;
  /** Digits only, with the country code when the report printed one. */
  phone: string | null;
};

export type CandidateLite = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
};

export type MatchReason = "phone" | "email" | "name";

export type MatchCandidate = { id: string; reasons: MatchReason[] };

export type MatchResult =
  | { status: "matched"; internId: string; reasons: MatchReason[] }
  | { status: "check"; candidates: MatchCandidate[] }
  | { status: "none" };

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
// 10-14 digits with at most one space or dash between digits; not glued to a word or a "#id".
const PHONE = /(?<![\w#])\+?\d(?:[ -]?\d){9,13}(?!\d)/g;
const CAN_ID = /#?\b(CAN\d{3,})\b/i;

/** Digits only. */
export function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

/** Lower-case letters only, split into words; punctuation and accents-as-marks dropped. */
export function nameTokens(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function parseReportHeader(lines: string[]): ReportHeader {
  const clean = lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const text = clean.join("\n");

  const email = text.match(EMAIL)?.[0]?.toLowerCase() ?? null;

  let phone: string | null = null;
  // Prefer the line that also carries the email (the "email • phone" line), else any line.
  const ordered = [...clean.filter((l) => EMAIL.test(l)), ...clean.filter((l) => !EMAIL.test(l))];
  for (const line of ordered) {
    for (const m of line.matchAll(PHONE)) {
      const digits = digitsOf(m[0]);
      if (digits.length >= 10 && digits.length <= 13) {
        phone = digits;
        break;
      }
    }
    if (phone) break;
  }

  const canIdx = clean.findIndex((l) => CAN_ID.test(l));
  const canId = canIdx >= 0 ? (clean[canIdx]!.match(CAN_ID)?.[1]?.toUpperCase() ?? null) : null;

  // The name is the line just above the candidate id; without an id, the first line with letters.
  const nameLine = canIdx > 0 ? clean[canIdx - 1] : clean.find((l) => /[A-Za-z]{2,}/.test(l) && !EMAIL.test(l));
  const name = nameLine && nameLine.length <= 80 && !EMAIL.test(nameLine) ? nameLine : null;

  return { name, canId, email, phone };
}

function samePhone(report: string | null, c: CandidateLite): boolean {
  if (!report) return false;
  const own = digitsOf(c.phoneNumber);
  if (own.length < 7) return false;
  const last10 = (d: string) => d.slice(-10);
  if (last10(report) !== last10(own)) return false;
  // When the report printed a country code, it must agree with the candidate's.
  if (report.length > 10) {
    const cc = digitsOf(c.countryCode);
    const printed = report.slice(0, report.length - 10);
    if (cc && printed !== cc) return false;
  }
  return true;
}

function sameEmail(report: string | null, c: CandidateLite): boolean {
  return !!report && report.toLowerCase() === c.email.trim().toLowerCase();
}

/**
 * Two words in common (any order) for names of two words or more; the one word
 * itself for a single-word name. "Ayush Sinha" = "Sinha, Ayush Kumar".
 */
export function sameName(report: string | null, c: CandidateLite): boolean {
  if (!report) return false;
  const a = new Set(nameTokens(report));
  const b = new Set(nameTokens(`${c.firstName} ${c.lastName}`));
  if (a.size === 0 || b.size === 0) return false;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common >= Math.min(2, a.size, b.size);
}

export function matchHeader(header: ReportHeader, candidates: CandidateLite[]): MatchResult {
  const scored: { id: string; reasons: MatchReason[]; strong: boolean }[] = [];
  for (const c of candidates) {
    const reasons: MatchReason[] = [];
    const phone = samePhone(header.phone, c);
    const email = sameEmail(header.email, c);
    const name = sameName(header.name, c);
    if (phone) reasons.push("phone");
    if (email) reasons.push("email");
    if (name) reasons.push("name");
    if (reasons.length === 0) continue;
    scored.push({ id: c.id, reasons, strong: phone && (email || name) });
  }

  const strong = scored.filter((s) => s.strong);
  if (strong.length === 1) return { status: "matched", internId: strong[0]!.id, reasons: strong[0]!.reasons };

  if (scored.length === 0) return { status: "none" };
  // Several strong matches, or only a weak one: show them best first and let a person decide.
  scored.sort((x, y) => Number(y.strong) - Number(x.strong) || y.reasons.length - x.reasons.length);
  return { status: "check", candidates: scored.map(({ id, reasons }) => ({ id, reasons })) };
}
