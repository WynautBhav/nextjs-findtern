/**
 * The account types that share the /login, /signup and recovery pages,
 * picked with `?as=`. Admin keeps its own unlisted /admin/login. Links we
 * build always name the type: a bare /login opens on the type this browser
 * last signed in as (LAST_DOOR_COOKIE), which would override an intern link.
 */
export const DOORS = ["intern", "employer", "college"] as const;
export type Door = (typeof DOORS)[number];

/** The `as` value if it names one of `allowed`, else the first allowed one. */
export function doorOf<D extends Door = Door>(value: unknown, allowed: readonly D[] = DOORS as unknown as readonly D[]): D {
  const v = Array.isArray(value) ? value[0] : value;
  return allowed.find((d) => d === v) ?? allowed[0];
}

/** `path` for `door`, e.g. authPath("/login", "employer", { next: "/x" }) → "/login?as=employer&next=%2Fx". */
export function authPath(path: string, door: Door, params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  q.set("as", door);
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** Cookie that remembers the last account type signed in, so /login opens on it. */
export const LAST_DOOR_COOKIE = "ft_door";

/** True for every intern and every company; the brand panel beside sign in and sign up. */
export const DOOR_POINTS = {
  intern: [
    { lead: "One AI interview", text: "It sets your Findtern Score out of 10. Paid once, never a subscription." },
    { lead: "Your score sets your rate", text: "Employers filter on it and the pay band follows it. Nobody can buy a higher one." },
    { lead: "Guaranteed within 18 months", text: "An internship within 18 months of your AI interview." },
  ],
  employer: [
    { lead: "Screened before you see them", text: "Every candidate has taken the AI interview and carries a Findtern Score." },
    { lead: "Priced by score", text: "Three bands: Espresso, Cappuccino and Latte. You see the rate before you send an offer." },
    { lead: "Nothing charged up front", text: "You pay when a candidate accepts your offer." },
  ],
};
