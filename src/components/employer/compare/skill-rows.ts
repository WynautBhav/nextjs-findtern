/**
 * Compare's skills as an aligned grid (bug sheet 12 Nov, row 7): one row per
 * skill the employer asked for, a tick or a dash per candidate, so the same
 * skill sits at the same height in every column; then one "Other skills" row
 * for whatever else each candidate lists.
 *
 * Pure and import-free so it runs under plain `node --test`.
 */

export const OTHER_SKILLS_MAX = 7;

/** "React · Advanced" -> "React": the level is private, the name is what is compared. */
function baseName(skill: string): string {
  return skill.split(" · ")[0].trim();
}

export type SkillAlignment = {
  /** One per required skill, in the order given; `has[i]` is for candidate `i`. */
  rows: { skill: string; has: boolean[] }[];
  /** One per candidate: skills outside `required` (first spelling, no repeats), at most `max`, and how many were cut. */
  other: { skills: string[]; more: number }[];
};

export function skillAlignment(required: string[], candidates: { skills: string[] }[], max = OTHER_SKILLS_MAX): SkillAlignment {
  const wanted = new Map<string, string>();
  for (const raw of required) {
    const name = baseName(raw);
    if (name && !wanted.has(name.toLowerCase())) wanted.set(name.toLowerCase(), name);
  }
  const owned = candidates.map((c) => new Set(c.skills.map((s) => baseName(s).toLowerCase()).filter(Boolean)));
  const rows = [...wanted].map(([key, skill]) => ({ skill, has: owned.map((set) => set.has(key)) }));
  const other = candidates.map((c) => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const raw of c.skills) {
      const name = baseName(raw);
      const key = name.toLowerCase();
      if (!name || wanted.has(key) || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return { skills: names.slice(0, max), more: Math.max(0, names.length - max) };
  });
  return { rows, other };
}
