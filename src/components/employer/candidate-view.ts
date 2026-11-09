/** Pure display rules for the candidate list, kept out of the components so they can be tested. */

export const MAX_SKILL_CHIPS = 7;

/** "React · Advanced" -> "React": the name a project skill is matched on. */
export function skillBaseName(skill: string): string {
  return skill.split(" · ")[0].trim();
}

/**
 * Project skills first, at most `max` shown, and how many were left out.
 * `skip` leaves out the first few (the row's lead line already names them), so
 * the lead and the chips together still stay within `max`.
 */
export function rowSkills(skills: string[], wanted: Set<string>, max = MAX_SKILL_CHIPS, skip = 0) {
  const isWanted = (s: string) => wanted.has(skillBaseName(s).toLowerCase());
  const ordered = [...skills.filter(isWanted), ...skills.filter((s) => !isWanted(s))];
  return { shown: ordered.slice(skip, max), more: Math.max(0, ordered.length - max), isWanted };
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

/**
 * What leads a row. Names are masked until hire and the schema has no role,
 * specialty or headline field (bio and summary are free text and stay hidden),
 * so the lead is the candidate's top skills, the ones you asked for first.
 * `rest` is what is left for the chip row, so no skill shows twice.
 */
export function skillLead(skills: string[], wanted: Set<string>, max = 3): { lead: string; rest: string[] } {
  const isWanted = (s: string) => wanted.has(skillBaseName(s).toLowerCase());
  const ordered = [...skills.filter(isWanted), ...skills.filter((s) => !isWanted(s))];
  const names = ordered.slice(0, max).map(skillBaseName);
  const lead = names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return { lead, rest: ordered.slice(max) };
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

/** Initials-tile colours: photos are rare, so this is what tells two "IT" rows apart. Text on each is ≥4.5:1. */
export const AVATAR_TINTS = ["bg-brand-50 text-brand-800", "bg-accent-100 text-ink-800", "bg-info-soft text-ink-800", "bg-ink-100 text-ink-800"] as const;

/** A stable tint per candidate: sum of the seed's char codes, mod 4. */
export function avatarTint(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

/** The `skills` URL value as a list: trimmed, de-duplicated without regard to case (the first spelling wins), at most `max`. */
export function dedupeSkills(raw: string, max = MAX_SKILL_CHIPS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const skill = part.trim();
    const key = skill.toLowerCase();
    if (!skill || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }
  return out.slice(0, max);
}

/**
 * The number on the Filters button: removable chips, required-skill chips and a
 * project-supplied city, one each. The Shortlist view sets the search filters
 * aside, so nothing counts there.
 */
export function filterCount(o: { chips: number; skills: number; projectCity: boolean; shortlistView: boolean }): number {
  return o.shortlistView ? 0 : o.chips + o.skills + (o.projectCity ? 1 : 0);
}

/**
 * "Clear all" resets to the project's own defaults, so the project's city chip
 * would come straight back: offer it only when a chip of the employer's own
 * would go.
 */
export function showClearAll(chipKeys: string[]): boolean {
  return chipKeys.some((key) => key !== "project-city");
}
