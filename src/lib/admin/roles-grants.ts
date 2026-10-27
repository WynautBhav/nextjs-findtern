/**
 * One-time role grants (no database import, so they can be unit tested).
 * Each is applied once by `ensureAdminRoles` and recorded in
 * `platform_settings` under its key, so a super admin who later removes the
 * permission does not get it re-added on the next boot.
 */
export type RoleGrant = { key: string; grant: { roles: string[]; permissions: string[] } };

export const ROLE_GRANTS: RoleGrant[] = [
  {
    // Legacy's payout and mark-paid routes checked no permission at all.
    key: "admin_roles_migration:transactions_write_v1",
    grant: { roles: ["admin", "exec_accounts"], permissions: ["transactions:write"] },
  },
  {
    // ADP-17 (owner decision, 27 Oct): in legacy any signed-in staff member
    // could score, approve, bulk-import ratings, edit skills and edit CMS
    // items, whatever their role said. The default Admin and Executive -
    // Operations roles keep those rights after cutover.
    key: "admin_roles_migration:ops_interns_cms_write_v1",
    grant: { roles: ["admin", "exec_operations"], permissions: ["interns:write", "cms:write"] },
  },
];

/** The role's permissions with the grant added; null when nothing changes. */
export function withGrant(current: unknown, permissions: string[]): string[] | null {
  const list = Array.isArray(current) ? current.filter((p): p is string => typeof p === "string") : [];
  // A wildcard role already has everything.
  if (list.includes("*")) return null;
  const next = [...new Set([...list, ...permissions])];
  return next.length === list.length ? null : next;
}
