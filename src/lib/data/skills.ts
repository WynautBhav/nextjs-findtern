/**
 * The skills vocabulary.
 *
 * 2,482 entries carried over from the legacy `client/src/data/skills.json`,
 * which every combobox on that site was seeded from. This build had no
 * vocabulary at all, so candidates typed free text - which means "React",
 * "react", "React.js" and "ReactJS" all become four different skills in the
 * database, and an employer filtering on "React" misses three candidates. The
 * matching that the product sells depends on this list existing.
 *
 * The list is a starting point, not a cage: the picker always accepts whatever
 * the candidate typed if it is not in here.
 */
import skills from "./skills.json" with { type: "json" };

export const SKILLS: string[] = skills;

/**
 * Non-technical skills, offered as one-tap picks on the skills step.
 *
 * The legacy vocabulary is almost entirely technical, so a candidate going for
 * sales, HR, operations or content had to know the exact word to type. Most of
 * these are already in the legacy list; the few that are not are added to the
 * search pool below without touching the list itself, so stored skills and
 * the legacy app's picker are unaffected.
 */
export const NON_TECH_SKILLS: string[] = [
  "Communication",
  "Sales",
  "Marketing",
  "Digital Marketing",
  "Social Media Marketing",
  "Content Writing",
  "Copywriting",
  "Human Resources",
  "Recruitment",
  "Operations",
  "Finance",
  "Accounting",
  "Customer Support",
  "Design Thinking",
  "Project Management",
  "Excel",
  "Public Speaking",
  "Negotiation",
  "Business Development",
  "Lead Generation",
  "Market Research",
  "Event Management",
  "Presentation Skills",
  "Leadership",
  "Teamwork",
  "Time Management",
  "Problem Solving",
  "Data Entry",
  "Tally",
  "Graphic Design",
  "Canva",
  "Video Editing",
];

/**
 * Technical skills, offered as one-tap picks next to the non-technical ones.
 * Every entry is spelled exactly as in the legacy vocabulary, so a pick here
 * stores the same string the legacy picker would.
 */
export const TECH_SKILLS: string[] = [
  "Python",
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Next.js",
  "HTML",
  "CSS",
  "SQL",
  "Java",
  "C++",
  "Data Analysis",
  "Machine Learning",
  "Deep Learning",
  "Data Visualization",
  "Power BI",
  "Tableau",
  "Pandas",
  "Figma",
  "UI/UX Design",
  "AWS",
  "Docker",
  "Git",
  "Linux",
  "MongoDB",
  "PostgreSQL",
  "MySQL",
  "Django",
  "Flutter",
  "Kotlin",
  "Angular",
  "Spring Boot",
  "REST API",
  "Cybersecurity",
  "SEO",
];

const KNOWN = new Set(SKILLS.map((s) => s.toLowerCase()));
/** What the picker searches: the legacy list plus non-technical skills it lacks. */
const POOL: string[] = [...SKILLS, ...[...TECH_SKILLS, ...NON_TECH_SKILLS].filter((s) => !KNOWN.has(s.toLowerCase()))];

/**
 * Case- and punctuation-insensitive key for a skill, so "React.js", "react js"
 * and "ReactJS" resolve to the same entry in the vocabulary.
 */
export function skillKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]/g, "")
    .replace(/\.js$/, "js")
    .replace(/\bjs\b/g, "js");
}

/**
 * Substring matches, best first: exact, then prefix, then contains.
 * Capped by the caller. Runs over ~2,500 strings per keystroke, which is
 * nothing, and no index is worth the complexity at this size.
 */
export function suggestSkills(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact: string[] = [];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const skill of POOL) {
    const lower = skill.toLowerCase();
    if (lower === q) exact.push(skill);
    else if (lower.startsWith(q)) prefix.push(skill);
    else if (lower.includes(q)) contains.push(skill);
    if (exact.length >= limit) break;
  }
  return [...exact, ...prefix, ...contains].slice(0, limit);
}

/**
 * One-tap picks as one list, technical and non-technical interleaved (bug
 * sheet 7, NC r19: "a mix of tech and non-tech, not only non-tech"). Two
 * technical, one non-technical, repeating, so the first screenful reads as a
 * mix whichever kind of candidate is looking.
 */
export const SUGGESTED_SKILLS: string[] = (() => {
  const out: string[] = [];
  const tech = [...TECH_SKILLS];
  const non = [...NON_TECH_SKILLS];
  while (tech.length || non.length) {
    if (tech.length) out.push(tech.shift()!);
    if (non.length) out.push(non.shift()!);
    if (tech.length) out.push(tech.shift()!);
  }
  return out;
})();

/** Edit distance, two rows at a time. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * "Did you mean …?" for a typed skill that is close to, but not, a known one
 * (legacy onboarding.tsx StepSkills). Null when the text is short, already
 * known, or nothing is close. `taken` skills are never suggested.
 */
export function didYouMean(typed: string, taken: string[] = []): string | null {
  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const q = normalize(typed);
  if (q.length < 3) return null;
  const takenSet = new Set(taken.map(normalize));
  if (takenSet.has(q)) return null;
  if (POOL.some((s) => normalize(s) === q)) return null;
  const max = Math.min(4, Math.max(1, Math.floor(q.length / 3)));
  let best: { value: string; d: number } | null = null;
  for (const skill of POOL) {
    const s = normalize(skill);
    if (takenSet.has(s) || Math.abs(s.length - q.length) > max) continue;
    const d = distance(q, s);
    if (d <= max && (!best || d < best.d)) {
      best = { value: skill, d };
      if (d === 1) break;
    }
  }
  return best?.value ?? null;
}