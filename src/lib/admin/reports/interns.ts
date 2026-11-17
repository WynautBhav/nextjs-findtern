/** Pure helpers for the Interns tab: bands, stages, skill names, the table filter. No DB, no React. */

export type Band = "espresso" | "cappuccino" | "latte" | "unscored";
export const BANDS: readonly Band[] = ["espresso", "cappuccino", "latte", "unscored"];
const BAND_LABEL: Record<Band, string> = { espresso: "Espresso", cappuccino: "Cappuccino", latte: "Latte", unscored: "Unscored" };
export const bandLabel = (b: Band) => BAND_LABEL[b];

/** Same cut-offs as lib/pricing-config bandIdForScore: below 6 Espresso, 6 to below 8 Cappuccino, 8 and up Latte. */
export function bandOf(score: number | null | undefined): Band {
  if (score == null || !Number.isFinite(score)) return "unscored";
  return score >= 8 ? "latte" : score >= 6 ? "cappuccino" : "espresso";
}

export type InternStage = "signed_up" | "profile_started" | "profile_complete" | "activated" | "interviewed" | "in_pipeline" | "hired";
export const INTERN_STAGES: readonly InternStage[] = ["signed_up", "profile_started", "profile_complete", "activated", "interviewed", "in_pipeline", "hired"];
export const STAGE_LABEL: Record<InternStage, string> = {
  signed_up: "Signed up",
  profile_started: "Profile started",
  profile_complete: "Profile complete",
  activated: "Paid activation",
  interviewed: "AI interview scored",
  in_pipeline: "Applied / has a proposal",
  hired: "Hired",
};

/** The furthest step an intern has reached (a paid intern with a thin profile still counts as activated). */
export function internStage(f: { profileStarted: boolean; profileComplete: boolean; feePaid: boolean; scored: boolean; applied: boolean; hired: boolean }): InternStage {
  if (f.hired) return "hired";
  if (f.applied) return "in_pipeline";
  if (f.scored) return "interviewed";
  if (f.feePaid) return "activated";
  if (f.profileComplete) return "profile_complete";
  if (f.profileStarted) return "profile_started";
  return "signed_up";
}

/** The skills of an onboarding row: stored as strings or `{name, rating}`; trimmed, de-duplicated ignoring case. */
export function skillNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const name = typeof item === "string" ? item : item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" ? (item as { name: string }).name : "";
    const t = name.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/** Escapes LIKE wildcards so a search for `50%` matches the text "50%" (use with `ESCAPE '\'`, the Postgres default). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const INTERN_PAGE_SIZE = 25;
export const INTERN_SORTS = ["joined", "name", "city", "score", "active"] as const;
export type InternSort = (typeof INTERN_SORTS)[number];
export const INTERN_STATUSES = ["active", "hidden", "banned", "hired", "unhired", "paid", "unpaid", "scored", "unscored"] as const;

export type InternFilter = { q: string; city: string; skill: string; status: string; band: "" | Band; page: number; sort: InternSort; dir: "asc" | "desc" };

export function parseInternFilter(p: Record<string, string | undefined>): InternFilter {
  const page = Number.parseInt(p.ipage ?? "", 10);
  return {
    q: (p.iq ?? "").trim().slice(0, 80),
    city: (p.icity ?? "").trim().slice(0, 80),
    skill: (p.iskill ?? "").trim().slice(0, 80),
    status: (INTERN_STATUSES as readonly string[]).includes(p.istatus ?? "") ? (p.istatus as string) : "",
    band: (BANDS as readonly string[]).includes(p.iband ?? "") ? (p.iband as Band) : "",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
    sort: (INTERN_SORTS as readonly string[]).includes(p.isort ?? "") ? (p.isort as InternSort) : "joined",
    dir: p.idir === "asc" ? "asc" : "desc",
  };
}
