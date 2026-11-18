import { sql, type SQL } from "drizzle-orm";

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

/**
 * One rule for "can this account sign in", shared by every admin list: only a true flag is active. A missing flag is
 * NOT active, which is what the session check does (account-status.ts: `Boolean(row.isActive)`, so such an account is
 * refused), so a list can never show "active" for an account that is locked out. is_active is NOT NULL in the schema;
 * this only matters for a row restored from an older dump.
 */
export const isActiveAccount = (flag: boolean | null | undefined): boolean => flag === true;

/** The same rule in SQL, for a column or expression. */
export const activeAccountSql = (flag: SQL | unknown): SQL => sql`coalesce(${flag}, false)`;

/** The Active / Inactive filter over an already-coalesced `is_active` alias. Null for any other value. */
export function statusFilterSql(status: string | undefined): SQL | null {
  if (status === "active") return sql`is_active`;
  if (status === "inactive") return sql`NOT is_active`;
  return null;
}
