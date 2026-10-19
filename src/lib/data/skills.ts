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

const KNOWN = new Set(SKILLS.map((s) => s.toLowerCase()));
/** What the picker searches: the legacy list plus non-technical skills it lacks. */
const POOL: string[] = [...SKILLS, ...NON_TECH_SKILLS.filter((s) => !KNOWN.has(s.toLowerCase()))];

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