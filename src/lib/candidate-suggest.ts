/**
 * Live suggestions under the Candidates search box: skills first, then cities, each already ranked by its source
 * (exact, prefix, contains). Merged into one capped list; the arrow keys walk it in the order shown. Pure.
 */
export type Suggestion = { kind: "skill" | "city"; label: string; /** A skill not yet required: "+ Require" is offered. */ canRequire: boolean };

export function rankSuggestions(
  skills: string[],
  cities: string[],
  opts: { required?: string[]; max?: number } = {},
): { skills: Suggestion[]; cities: Suggestion[]; all: Suggestion[] } {
  const max = opts.max ?? 8;
  const required = new Set((opts.required ?? []).map((s) => s.toLowerCase()));
  const uniq = (list: string[]) => {
    const seen = new Set<string>();
    return list.filter((s) => {
      const key = s.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const s = uniq(skills);
  const c = uniq(cities);
  // Five skills and three cities; a short group hands its room to the other.
  const cityRoom = Math.min(c.length, Math.max(max - s.length, Math.min(3, max)));
  const skillRoom = Math.min(s.length, max - cityRoom);
  const out = {
    skills: s.slice(0, skillRoom).map((label): Suggestion => ({ kind: "skill", label, canRequire: !required.has(label.toLowerCase()) })),
    cities: c.slice(0, cityRoom).map((label): Suggestion => ({ kind: "city", label, canRequire: false })),
  };
  return { ...out, all: [...out.skills, ...out.cities] };
}

/** The list link for a typed word: `base` is the current filters without `q` (and without the page). Empty clears the search. */
export function searchHref(pathname: string, base: string, q: string): string {
  const next = new URLSearchParams(base);
  const word = q.trim().slice(0, 60);
  if (word) next.set("q", word);
  else next.delete("q");
  next.delete("page");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
