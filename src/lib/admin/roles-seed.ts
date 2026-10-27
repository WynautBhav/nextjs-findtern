import { eq, inArray } from "drizzle-orm";

import { getDb, hasDb, schema } from "@/lib/db";

import { ROLE_GRANTS, withGrant } from "./roles-grants";

/**
 * Legacy's default roles (same keys as the live `admin_roles` rows), plus
 * `transactions:write` on Admin and Accounts. That permission is new in this
 * build - legacy's payout and mark-paid routes checked no permission at all,
 * so these two roles could already do money actions there. Without it, only
 * a super admin could record a payout after cutover.
 */
export const DEFAULT_ROLES: { key: string; name: string; permissions: string[] }[] = [
  { key: "super_admin", name: "Super Admin", permissions: ["*"] },
  {
    key: "admin",
    name: "Admin",
    permissions: [
      "dashboard:read",
      "users:read",
      "interns:read",
      "companies:read",
      "reports:read",
      "transactions:read",
      "transactions:write",
      "contact:intern:read",
      "contact:employer:read",
      "notifications:read",
      "cms:read",
    ],
  },
  {
    key: "exec_accounts",
    name: "Executive - Accounts",
    permissions: ["reports:read", "transactions:read", "transactions:write"],
  },
  { key: "exec_operations", name: "Executive - Operations", permissions: ["interns:read", "notifications:read", "contact:intern:read"] },
  { key: "exec_sales", name: "Executive - Sales", permissions: ["companies:read", "contact:employer:read"] },
];

/** One-time role updates, each recorded in `platform_settings` once applied. */
const MIGRATIONS = ROLE_GRANTS;

/**
 * Create missing default roles and apply each one-time grant exactly once.
 * The marker row is what makes it one-time: a super admin who later removes
 * `transactions:write` from a role does not get it re-added on the next boot.
 */
export async function ensureAdminRoles(db: ReturnType<typeof getDb> = getDb()): Promise<void> {
  await db.insert(schema.adminRoles).values(DEFAULT_ROLES).onConflictDoNothing({ target: schema.adminRoles.key });

  for (const m of MIGRATIONS) {
    const [done] = await db
      .select({ key: schema.platformSettings.key })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, m.key))
      .limit(1);
    if (done) continue;

    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: schema.adminRoles.id, permissions: schema.adminRoles.permissions })
        .from(schema.adminRoles)
        .where(inArray(schema.adminRoles.key, m.grant.roles));
      for (const row of rows) {
        const next = withGrant(row.permissions, m.grant.permissions);
        if (!next) continue;
        await tx
          .update(schema.adminRoles)
          .set({ permissions: next, updatedAt: new Date() })
          .where(eq(schema.adminRoles.id, row.id));
      }
      await tx
        .insert(schema.platformSettings)
        .values({ key: m.key, value: { appliedAt: new Date().toISOString() }, updatedAt: new Date() })
        .onConflictDoNothing({ target: schema.platformSettings.key });
    });
  }
}

let once: Promise<void> | null = null;

/** Per-process memo for hot paths (the admin gate). Errors are retried later. */
export function ensureAdminRolesOnce(): Promise<void> {
  if (!hasDb()) return Promise.resolve();
  once ??= ensureAdminRoles().catch(() => {
    once = null;
  });
  return once;
}
