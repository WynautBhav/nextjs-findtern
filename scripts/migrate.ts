/**
 * Apply drizzle/*.sql to an existing database, once each, without dropping
 * anything. Safe on a copy of the live legacy database.
 *
 * - Applied files are recorded in `_ft_migrations`.
 * - A database that already has the legacy tables but no `_ft_migrations` is
 *   baselined: 0000 (the initial CREATE TABLEs) is recorded, never executed.
 * - Statements are made idempotent (IF NOT EXISTS) so a half-applied file can
 *   be re-run.
 * - scripts/legacy-backfill.sql runs last on every invocation; it only fixes
 *   legacy rows and is idempotent.
 *
 * Usage: DATABASE_URL=… npm run db:migrate
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

const DIR = join(process.cwd(), "drizzle");
const BACKFILL = join(process.cwd(), "scripts", "legacy-backfill.sql");

export function idempotent(stmt: string): string {
  return stmt
    .replace(/^CREATE TABLE "/i, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/^CREATE (UNIQUE )?INDEX "/i, (_m, u = "") => `CREATE ${u}INDEX IF NOT EXISTS "`)
    .replace(/ADD COLUMN "/gi, 'ADD COLUMN IF NOT EXISTS "');
}

export function statements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS _ft_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    const applied = new Set(
      (await client.query<{ name: string }>("SELECT name FROM _ft_migrations")).rows.map((r) => r.name),
    );
    const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

    if (applied.size === 0) {
      const { rows } = await client.query(`SELECT to_regclass('users') IS NOT NULL AS has`);
      if (rows[0].has) {
        // Existing (legacy) schema: create only what's missing from 0000.
        // Each statement runs on its own so one clash can't block the rest.
        let skipped = 0;
        await client.query("BEGIN");
        for (const stmt of statements(readFileSync(join(DIR, files[0]), "utf8"))) {
          await client.query("SAVEPOINT s");
          try {
            await client.query(idempotent(stmt));
            await client.query("RELEASE SAVEPOINT s");
          } catch (err) {
            await client.query("ROLLBACK TO SAVEPOINT s");
            skipped++;
            console.warn(`  skipped: ${stmt.split("\n")[0].slice(0, 90)} (${(err as Error).message})`);
          }
        }
        await client.query("INSERT INTO _ft_migrations (name) VALUES ($1)", [files[0]]);
        await client.query("COMMIT");
        applied.add(files[0]);
        console.log(`baselined existing schema at ${files[0]}${skipped ? ` (${skipped} statements skipped, see above)` : ""}`);
      }
    }

    for (const file of files) {
      if (applied.has(file)) continue;
      process.stdout.write(`applying ${file} … `);
      await client.query("BEGIN");
      try {
        for (const stmt of statements(readFileSync(join(DIR, file), "utf8"))) {
          await client.query(idempotent(stmt));
        }
        await client.query("INSERT INTO _ft_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log("ok");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`failed applying ${file}: ${(err as Error).message}`);
      }
    }

    if (existsSync(BACKFILL)) {
      process.stdout.write("legacy backfill … ");
      await client.query(readFileSync(BACKFILL, "utf8"));
      console.log("ok");
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
