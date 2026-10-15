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
 * Capped by the caller. Runs over 2,482 strings per keystroke, which is
 * nothing, and no index is worth the complexity at this size.
 */
export function suggestSkills(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact: string[] = [];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const skill of SKILLS) {
    const lower = skill.toLowerCase();
    if (lower === q) exact.push(skill);
    else if (lower.startsWith(q)) prefix.push(skill);
    else if (lower.includes(q)) contains.push(skill);
    if (exact.length >= limit) break;
  }
  return [...exact, ...prefix, ...contains].slice(0, limit);
}