/** Pure display rules for the candidate list, kept out of the components so they can be tested. */

export const MAX_SKILL_CHIPS = 7;

/** "React · Advanced" -> "React": the name a project skill is matched on. */
export function skillBaseName(skill: string): string {
  return skill.split(" · ")[0].trim();
}

/** Project skills first, at most `max` shown, and how many were left out. */
export function rowSkills(skills: string[], wanted: Set<string>, max = MAX_SKILL_CHIPS) {
  const isWanted = (s: string) => wanted.has(skillBaseName(s).toLowerCase());
  const ordered = [...skills.filter(isWanted), ...skills.filter((s) => !isWanted(s))];
  return { shown: ordered.slice(0, max), more: Math.max(0, ordered.length - max), isWanted };
}

/** `HIDDEN_UNTIL_HIRE` in lib/contact-scrub (inlined: this module stays import-free for the node tests). */
const MASKED = "[hidden until hire]";

/**
 * "B.Tech, Computer Science". A field the contact scrub masked whole is left
 * out rather than shown as the marker (it reads "B.Tech" as a .tech domain).
 */
export function studyOf(academics: { degree: string; specialization: string } | null | undefined): string {
  return [academics?.degree, academics?.specialization].filter((s) => s && s.trim() !== MASKED).join(", ");
}

/** The line under a candidate's initials: degree and field, else the top two skills. Never the bio. */
export function headlineOf(c: {
  academics: { degree: string; specialization: string } | null;
  skills: string[];
}): string {
  const study = studyOf(c.academics);
  if (study) return study;
  const top = c.skills.slice(0, 2).map(skillBaseName);
  return top.length ? `${top.join(" and ")} intern` : "";
}

/**
 * The sort select: a pointer choice applies at once, but arrow keys on a closed
 * select fire `change` per step (Chrome/Firefox on Windows), so a keyboard choice
 * waits for Enter or blur (WCAG 3.2.2).
 */
export function sortChangeAction(viaKeyboard: boolean): "navigate" | "hold" {
  return viaKeyboard ? "hold" : "navigate";
}

/** What to apply when a held keyboard choice is committed, or null when nothing changed. */
export function sortCommitValue(pending: string | null, current: string): string | null {
  return pending !== null && pending !== current ? pending : null;
}
