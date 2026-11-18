type AccountKind = "intern" | "employer" | "admin";

export type AccountCounts = Record<AccountKind, number>;

/**
 * The account-type tabs. "Everyone" is the sum of the type tabs shown, so the
 * four numbers can never disagree on screen: staff are in the total only when
 * the viewer can see the Staff tab.
 */
export function accountViews(byKind: AccountCounts, showStaff: boolean): { key: "" | AccountKind; label: string; count: number }[] {
  const kinds = [
    { key: "intern" as const, label: "Candidates", count: byKind.intern },
    { key: "employer" as const, label: "Companies", count: byKind.employer },
    ...(showStaff ? [{ key: "admin" as const, label: "Staff", count: byKind.admin }] : []),
  ];
  return [{ key: "" as const, label: "Everyone", count: kinds.reduce((n, k) => n + k.count, 0) }, ...kinds];
}
