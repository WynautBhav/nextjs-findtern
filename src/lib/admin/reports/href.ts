/** Links inside the Reports tabs: keep the query, change a few keys. Pure. */
export const REPORTS_PATH = "/admin/reports";

/** `patch` values win; an empty or undefined value removes the key. `reset` keys are removed after the patch (a table's page number when its filter changes). */
export function reportHref(current: Record<string, string | undefined>, patch: Record<string, string | undefined>, reset: string[] = []): string {
  const q = new URLSearchParams();
  const merged: Record<string, string | undefined> = { ...current, ...patch };
  for (const k of reset) if (!(k in patch)) delete merged[k];
  for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${REPORTS_PATH}?${s}` : REPORTS_PATH;
}
