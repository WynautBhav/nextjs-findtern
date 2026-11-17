/**
 * City names typed by hand ("Jaipur", "jaipur ", "Jaypur, Rajasthan") folded to one city. Pure.
 *
 * Deliberately small: a hand-kept alias table for the cities our interns actually come from, plus
 * generic cleaning (case, spacing, punctuation, trailing state or PIN) for everything else. It never
 * guesses between two real cities: "Jaipur" and "Jodhpur" are one letter apart and stay apart.
 * Delhi and New Delhi are one city here (an intern in either says "Delhi" to an employer); Noida,
 * Gurugram and Ghaziabad are NOT folded into Delhi.
 */

export type NormalCity = { key: string; label: string };

/** Variant (already cleaned: lower case, single spaces) -> canonical key. */
const ALIASES: Record<string, string> = {
  jaypur: "jaipur", jaipure: "jaipur", jaipr: "jaipur", jiapur: "jaipur", jaipuur: "jaipur",
  jodpur: "jodhpur", jodhpurr: "jodhpur", jodhapur: "jodhpur", jodhpure: "jodhpur",
  bangalore: "bengaluru", bengalooru: "bengaluru", bengalore: "bengaluru", banglore: "bengaluru", "bangalore urban": "bengaluru", "bengaluru urban": "bengaluru", blr: "bengaluru",
  gurgaon: "gurugram", gurugram: "gurugram",
  bombay: "mumbai", "navi mumbai": "navi mumbai",
  poona: "pune",
  calcutta: "kolkata",
  madras: "chennai",
  "new delhi": "delhi", "delhi ncr": "delhi", ncr: "delhi", "n delhi": "delhi",
  hyderbad: "hyderabad", hydrabad: "hyderabad",
  ahmadabad: "ahmedabad", amdavad: "ahmedabad",
  udaipure: "udaipur", udaypur: "udaipur",
  lucknow: "lucknow", lakhnau: "lucknow",
  trivandrum: "thiruvananthapuram",
  vizag: "visakhapatnam",
  cochin: "kochi",
  mysore: "mysuru",
  baroda: "vadodara",
};

/** Words that are a state or country tacked on after the city, not part of it. */
const TAIL = new Set(["rajasthan", "raj", "rj", "india", "maharashtra", "karnataka", "delhi ncr", "gujarat", "haryana", "up", "uttar pradesh", "mp", "madhya pradesh", "tamil nadu", "telangana", "punjab"]);
const JUNK = new Set(["", "-", "na", "n a", "none", "null", "nil", "undefined", "not given", "other", "others", "unknown", "test"]);

function clean(raw: string): string {
  let s = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, " ") // "jaipur (raj)" -> "jaipur"
    .replace(/[.,;:/\\|_\-\u2013\u2014]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b\d{4,6}\b/g, " ") // PIN codes
    .replace(/\s+/g, " ")
    .trim();
  // Strip a trailing state/country word(s): "kota rajasthan" -> "kota" (but keep "rajasthan" alone out of it).
  for (let guard = 0; guard < 2; guard++) {
    const words = s.split(" ");
    let cut = false;
    for (const n of [2, 1]) {
      if (words.length > n && TAIL.has(words.slice(-n).join(" "))) {
        s = words.slice(0, -n).join(" ");
        cut = true;
        break;
      }
    }
    if (!cut) break;
  }
  return s;
}

const title = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** The folded key and display label, or null when the value is empty or junk ("-", "n/a", digits only). */
export function normalizeCity(raw: string | null | undefined): NormalCity | null {
  if (raw == null) return null;
  let s = clean(String(raw));
  if (JUNK.has(s) || !/\p{L}/u.test(s)) return null;
  s = ALIASES[s] ?? s;
  return { key: s, label: title(s) };
}

export type MergedCity = { key: string; label: string; count: number; state?: string | null };

/**
 * Rows grouped by a cheap SQL key (lower/trim) merged by the full normaliser: counts added, biggest first,
 * ties by name. Rows with no usable city are dropped. A `state` on the rows is carried: the one of the biggest row.
 */
export function mergeCityRows(rows: readonly { city: string | null; count: number; state?: string | null }[]): MergedCity[] {
  const by = new Map<string, MergedCity & { top: number }>();
  for (const r of rows) {
    const n = normalizeCity(r.city);
    if (!n) continue;
    const hit = by.get(n.key);
    if (hit) {
      hit.count += r.count;
      if (r.count > hit.top && "state" in r) {
        hit.state = r.state ?? null;
        hit.top = r.count;
      }
    } else by.set(n.key, { ...n, count: r.count, top: r.count, ...("state" in r ? { state: r.state ?? null } : {}) });
  }
  return [...by.values()]
    .map((c): MergedCity => (c.state === undefined && !("state" in c) ? { key: c.key, label: c.label, count: c.count } : { key: c.key, label: c.label, count: c.count, state: c.state }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** SQL `LIKE` patterns (lower case) that match every spelling of a city key in a hand-typed column: the key, its aliases, each also followed by a space, comma, dot, dash or bracket ("jaipur, rajasthan"). */
export function cityPatterns(key: string): string[] {
  const names = [key, ...Object.entries(ALIASES).filter(([, canon]) => canon === key).map(([v]) => v)];
  const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
  return names.flatMap((n) => [esc(n), ...[" ", ",", ".", "-", "("].map((tail) => `${esc(n)}${tail}%`)]);
}

/** The city search box: matches the folded key, its label, or any spelling that folds to it. Empty matches all. */
export function cityMatches(query: string, key: string): boolean {
  const q = clean(query);
  if (!q) return true;
  if (key.includes(q)) return true;
  const alias = ALIASES[q];
  if (alias && alias === key) return true;
  return Object.entries(ALIASES).some(([variant, canon]) => canon === key && variant.includes(q));
}
