import { allows, type Permission } from "./permissions.ts";

/**
 * Pure helpers for the admin command palette and its search route
 * (`/api/admin/search`). No database or framework imports, so they run
 * under `node --test`.
 */

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 64;
export const SEARCH_LIMIT = 5;

export type SearchGroup = "candidates" | "companies" | "invoices";

/** Which permission opens each result group (any one is enough). */
export const GROUP_PERMISSIONS: Record<SearchGroup, Permission[]> = {
  candidates: ["interns:read"],
  companies: ["companies:read"],
  invoices: ["transactions:read"],
};

/** The groups this session may search. A super admin (`*`) gets all three. */
export function allowedGroups(granted: readonly string[] | undefined): SearchGroup[] {
  return (Object.keys(GROUP_PERMISSIONS) as SearchGroup[]).filter((g) => allows(granted, GROUP_PERMISSIONS[g]));
}

/** Trimmed query, or `null` when it is too short or too long to search. */
export function cleanQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").trim();
  return q.length >= SEARCH_MIN && q.length <= SEARCH_MAX ? q : null;
}

/** Escapes `%`, `_` and `\` so user input is a literal inside a LIKE pattern (use with `ESCAPE '\'`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** The ILIKE pattern for "contains this text". */
export function likePattern(value: string): string {
  return `%${escapeLike(value)}%`;
}

export type SearchHit = { id: string; label: string; sublabel: string };
export type InvoiceHit = SearchHit & { kind: "order" | "intern" };
export type SearchResponse = { candidates: SearchHit[]; companies: SearchHit[]; invoices: InvoiceHit[] };

/** Where an invoice result opens: the list that holds it, filtered to its number. */
export function invoiceHref(hit: Pick<InvoiceHit, "kind" | "label">): string {
  const base = hit.kind === "intern" ? "/admin/intern-invoices" : "/admin/orders";
  return `${base}?q=${encodeURIComponent(hit.label)}`;
}
