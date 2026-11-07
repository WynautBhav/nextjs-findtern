/**
 * One rule for every place a skills array is accepted: at most 7 skills.
 * Pure (no database), so API routes, imports and client UIs share it.
 */
export const MAX_SKILLS = 7;
export const MAX_SKILL_LENGTH = 40;

/** Trim, drop empties, cap length, dedupe case-insensitively (first spelling wins). */
export function normalizeSkills(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const name = typeof raw === "string" ? raw : raw && typeof raw === "object" && typeof (raw as { name?: unknown }).name === "string" ? (raw as { name: string }).name : "";
    const clean = name.trim().replace(/\s+/g, " ").slice(0, MAX_SKILL_LENGTH).trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

const keyOf = (list: string[]) => list.map((s) => s.toLowerCase()).sort().join("\u0000");

export type SkillsResult = { ok: true; skills: string[] } | { ok: false; error: string };

/**
 * Accept `next` only when it has at most 7 skills. Legacy rows may hold more:
 * such a list is accepted only if unchanged, or reduced to 7 or fewer. It may
 * never grow or be swapped while staying above 7.
 */
export function validateSkills(next: unknown, previous?: unknown): SkillsResult {
  const skills = normalizeSkills(next);
  if (skills.length <= MAX_SKILLS) return { ok: true, skills };
  const prev = normalizeSkills(previous);
  if (prev.length > MAX_SKILLS && skills.length <= prev.length && keyOf(skills) === keyOf(prev)) {
    return { ok: true, skills: prev };
  }
  return {
    ok: false,
    error:
      prev.length > MAX_SKILLS
        ? `Reduce to ${MAX_SKILLS} skills or fewer (or leave the list unchanged).`
        : `Pick at most ${MAX_SKILLS} key skills.`,
  };
}

/** True when a stored list is above the limit (legacy data, for the admin report). */
export function legacyOverLimit(skills: unknown): boolean {
  return normalizeSkills(skills).length > MAX_SKILLS;
}
