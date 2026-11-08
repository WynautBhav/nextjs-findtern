/**
 * Decides whether scripts/migrate.ts may touch the database on this run.
 * Pure (env in, decision out) so it is unit-tested in src/lib/migrate-gate.test.ts.
 *
 * Vercel runs migrate.ts on every build (vercel.json buildCommand), including
 * Preview builds of branches and PRs. Those must not migrate a shared database.
 *
 *   MIGRATE_ALLOW=1          -> run (explicit opt-in, wins everywhere)
 *   VERCEL unset / empty     -> run (local dev, CI, GitHub staging workflows, self-hosted)
 *   VERCEL_ENV=production    -> run
 *   anything else on Vercel  -> skip (preview, development, custom environments,
 *                               or VERCEL_ENV missing: we cannot tell, so we do not migrate)
 */
export type MigrateDecision = { run: true; reason: string } | { run: false; reason: string };

export function migrateDecision(env: Readonly<Record<string, string | undefined>>): MigrateDecision {
  if (env.MIGRATE_ALLOW === "1") return { run: true, reason: "MIGRATE_ALLOW=1" };
  if (!env.VERCEL) return { run: true, reason: "not a Vercel build" };
  if (env.VERCEL_ENV === "production") return { run: true, reason: "VERCEL_ENV=production" };
  return {
    run: false,
    reason: `Vercel build with VERCEL_ENV=${env.VERCEL_ENV || "(unset)"}; migrations only run on production (set MIGRATE_ALLOW=1 to override)`,
  };
}
