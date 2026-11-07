export type Orderable = { id: string; createdAt: Date | string | null; matched: number; offered: boolean };

export type RoleSort = "match" | "newest";

function time(v: Date | string | null): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Offers first, then (for "match") most matched skills, then newest. Does not mutate. */
export function sortRoles<T extends Orderable>(rows: readonly T[], sort: RoleSort = "match"): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.offered) - Number(a.offered) ||
      (sort === "match" ? b.matched - a.matched : 0) ||
      time(b.createdAt) - time(a.createdAt),
  );
}
