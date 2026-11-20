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

/**
 * How the candidates are laid out: "list" is the full-width cards (the default, shown as "Cards"), "grid" the
 * compact cards two across, "rows" one dense line per candidate (shown as "List"). Same actions in all three.
 */
export type ListView = "list" | "grid" | "rows";

/**
 * The `view` URL value: "grid" and "rows" are themselves, anything else (missing, misspelt, the retired
 * "table") is the full-width cards.
 */
export function parseView(raw: string | null | undefined): ListView {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "grid" || v === "rows" ? v : "list";
}

/** Candidates per page the employer can pick. The first is the default, so 20-30 results are never one long scroll. */
export const PAGE_SIZES = [12, 24, 48] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/** The `pageSize` URL value: one of PAGE_SIZES, else the default. */
export function parsePageSize(raw: string | number | null | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/**
 * Which slice of `total` a page shows. The page is clamped into range, so a stale link past the last page
 * (or page 0) shows the nearest real one, and "Showing a-b of c" is always true.
 */
export function pageWindow(total: number, page: number, pageSize: number): { page: number; pages: number; start: number; end: number; first: number; last: number } {
  const size = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
  const count = Math.max(0, Math.floor(total) || 0);
  const pages = Math.max(1, Math.ceil(count / size));
  const at = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  const start = (at - 1) * size;
  const end = Math.min(count, start + size);
  return { page: at, pages, start, end, first: count === 0 ? 0 : start + 1, last: end };
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
 * What the city field starts with. An explicit `city` in the URL (even empty = "no city") always wins;
 * otherwise the selected project's city (`defaultCity`, already empty when there is none or defaults are off)
 * fills it. `prefilled` is true only while the value is that default, which is when the field says so.
 */
export function cityField(o: { city: string; citySet: boolean; defaultCity: string }): { value: string; prefilled: boolean } {
  if (o.citySet || !o.defaultCity) return { value: o.city, prefilled: false };
  return { value: o.defaultCity, prefilled: true };
}

/**
 * What the filter form puts in the URL for `city`, or null for nothing. The project's own city is never sent
 * (it applies by default). A cleared field is sent empty (`city=`, "no city") only when there is a default to
 * opt out of; anything else typed is explicit.
 */
export function cityParam(value: string, defaultCity: string): string | null {
  const v = value.trim();
  if (!v) return defaultCity ? "" : null;
  return v.toLowerCase() === defaultCity.trim().toLowerCase() ? null : v;
}

/**
 * "Clear all" resets to the project's own defaults, so the project's city chip
 * would come straight back: offer it only when a chip of the employer's own
 * would go.
 */
export function showClearAll(chipKeys: string[]): boolean {
  return chipKeys.some((key) => key !== "project-city");
}

export type RelaxKey = "q" | "skill" | "city" | "remote" | "project" | "pro" | "score";
export type Relaxation = { key: RelaxKey; label: string; hint: string };

/**
 * One-click ways to widen an empty list, in the order worth trying: the typed keyword, the last required skill,
 * the city, remote-only candidates, the project's own skills, the Findtern Pro filters, the score floors. Only
 * what is actually narrowing the list is offered; `max` caps how many. The page turns each key into a link.
 */
export function relaxations(
  o: {
    q: string;
    /** The skills the list is filtered by (the employer's or the project's). */
    skills: string[];
    cities: string[];
    /** Candidates who only work remotely are in the list. */
    includeRemote: boolean;
    proFilters: boolean;
    scoreFloors: boolean;
    /** How the selected project relates to the list: see `projectMatchState`. */
    match: "matched" | "edited" | "off" | "none";
    projectName: string;
    saved: boolean;
  },
  max = 4,
): Relaxation[] {
  if (o.saved) return [];
  const out: Relaxation[] = [];
  if (o.q.trim()) out.push({ key: "q", label: "Clear the search", hint: `Search looks at skills and cities only, so “${o.q.trim()}” may be matching nothing.` });
  const last = o.skills[o.skills.length - 1];
  if (last) out.push({ key: "skill", label: `Drop ${skillBaseName(last)}`, hint: o.skills.length === 1 ? "Then any skill counts." : `Keeps the other ${o.skills.length - 1} skill${o.skills.length === 2 ? "" : "s"}.` });
  if (o.cities.length > 0) out.push({ key: "city", label: "Any city", hint: "Candidates are listed wherever they want to work." });
  if (!o.includeRemote) out.push({ key: "remote", label: "Include remote-only candidates", hint: "People who only work remotely are left out now." });
  if (o.match === "edited") out.push({ key: "project", label: "Reset to project skills", hint: `Back to the skills of ${o.projectName || "the project"}.` });
  if (o.proFilters) out.push({ key: "pro", label: "Clear CGPA and college filters", hint: "Findtern Pro filters narrow the list the most." });
  if (o.scoreFloors) out.push({ key: "score", label: "Clear score minimums", hint: "Findtern Score and the sub-score floors." });
  return out.slice(0, max);
}
