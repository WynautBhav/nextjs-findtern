/**
 * A project name must not give away the company: candidates see the project
 * before they know who the employer is. Pure, so server and form share it.
 * shortcut: one brand word of a multi-word name ("Acme" of "Acme Technologies")
 * is allowed, since generic words would block honest names; tighten if needed.
 */

const LEGAL_SUFFIXES = new Set([
  "pvt", "private", "ltd", "limited", "llp", "llc", "inc", "incorporated", "corp",
  "corporation", "co", "company", "opc", "plc", "gmbh", "the",
]);

const normalize = (s: string) =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// "A.R. portal" -> "AR portal" before splitting into tokens.
const words = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b([a-z0-9])\.(?=[a-z0-9]\b)/gi, "$1")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const initials = (w: string[]) => w.map((x) => x[0]).join("");

const TAIL = "Candidates see the project before they know which company it is.";

export function projectNameIssue(projectName: string, companyName: string | null | undefined): string | null {
  const company = words(companyName ?? "");
  if (company.length === 0) return null;
  const core = company.filter((w) => !LEGAL_SUFFIXES.has(w));
  const coreWords = core.length > 0 ? core : company;
  const project = words(projectName);

  const coreKey = coreWords.join("");
  if (coreKey.length >= 3) {
    if (normalize(projectName).includes(coreKey)) return `Leave your company name out of the project name. ${TAIL}`;
  } else if (coreWords.length > 0) {
    // Short names ("HP", "3M") only match as whole words, or "Chip" would trip "HP".
    for (let i = 0; i + coreWords.length <= project.length; i++) {
      if (coreWords.every((w, j) => project[i + j] === w)) return `Leave your company name out of the project name. ${TAIL}`;
    }
  }

  if (coreWords.length >= 2) {
    for (const cand of [initials(coreWords), initials(company)]) {
      if (cand.length >= 2 && project.includes(cand)) {
        return `"${cand.toUpperCase()}" looks like your company's initials. Leave them out of the project name: ${TAIL.charAt(0).toLowerCase()}${TAIL.slice(1)}`;
      }
    }
  }
  return null;
}
