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

// "A.R. portal" -> "AR portal" before splitting into tokens. Case is kept here
// (the 2-letter initials rule needs it); `words` lowercases for everything else.
const rawWords = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b([a-z0-9])\.(?=[a-z0-9]\b)/gi, "$1")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);

const words = (s: string) => rawWords(s).map((w) => w.toLowerCase());

const initials = (w: string[]) => w.map((x) => x[0]).join("");

const TAIL = "Candidates see the project before they know which company it is.";

/** Common acronyms and short words: typed in capitals they are not read as a company's two initials. */
const COMMON_TWO_LETTER = new Set([
  "ai", "ml", "it", "qa", "us", "ui", "ux", "hr", "pr", "bi", "db", "os",
  "at", "in", "on", "to", "or", "an", "as", "is", "io", "go", "no", "ok",
]);

export function projectNameIssue(projectName: string, companyName: string | null | undefined): string | null {
  const company = words(companyName ?? "");
  if (company.length === 0) return null;
  const core = company.filter((w) => !LEGAL_SUFFIXES.has(w));
  const coreWords = core.length > 0 ? core : company;
  const rawProject = rawWords(projectName);
  const project = rawProject.map((w) => w.toLowerCase());

  // Whole words only: a run of project words that, joined, spells the company core
  // ("Zentrova Labs", "zentrova-labs", "ZentrovaLabs"). "Nova" never trips "Innovation".
  // A plural or possessive tail still names the company: "Acmes", "Acme's" (which splits
  // into "acme" + "s"), "Acmes'", "Boxes" for "Box". The tail must end the run, so it never
  // matches inside a longer word ("Novas" is blocked, "Novara" is not).
  const coreKey = coreWords.join("");
  const hits = new Set([coreKey, `${coreKey}s`, `${coreKey}es`]);
  const maxLen = coreKey.length + 2;
  for (let i = 0; i < project.length; i++) {
    let run = "";
    for (let j = i; j < project.length && run.length < maxLen; j++) {
      run += project[j];
      if (hits.has(run)) return `Leave your company name out of the project name. ${TAIL}`;
    }
  }

  if (coreWords.length >= 2) {
    for (const cand of [initials(coreWords), initials(company)]) {
      if (cand.length < 2) continue;
      // Two letters collide with real words and acronyms ("AI", "IT", "at"): only
      // block them typed in capitals, and never the common ones. 3+ always match.
      const hit =
        cand.length === 2
          ? !COMMON_TWO_LETTER.has(cand) && rawProject.some((w) => w === w.toUpperCase() && w.toLowerCase() === cand)
          : project.includes(cand);
      if (hit) {
        return `"${cand.toUpperCase()}" looks like your company's initials. Leave them out of the project name: ${TAIL.charAt(0).toLowerCase()}${TAIL.slice(1)}`;
      }
    }
  }
  return null;
}
