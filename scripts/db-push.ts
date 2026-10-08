/**
 * Apply the generated DDL to the dev database.
 *
 * `drizzle-kit push` is interactive and wants a TTY, so it cannot run from a
 * script or in CI. This executes the SQL that `db:generate` produced instead.
 *
 * Destructive by design: it drops the public schema first, so the result is
 * always exactly what the current `schema.ts` describes. Correct for a
 * throwaway dev cluster, wrong for anything you care about — which is why it
 * refuses to run against a non-local host without an explicit --force.
 *
 * Usage: npm run db:push
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

const MIGRATIONS = join(process.cwd(), "drizzle");

async function main() {
  if (!existsSync(MIGRATIONS)) throw new Error(`No migrations at ${MIGRATIONS}. Run: npm run db:generate`);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — run via `npm run db:push`");

  // Dropping the public schema is irreversible, so it is gated on the target
  // actually being a local dev cluster unless the caller insists.
  const isLocal = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|\[::1\])/.test(url);
  if (!isLocal && !process.argv.includes("--force")) {
    throw new Error(
      `Refusing to drop the schema on a non-local database (${url.replace(/:[^:@/]*@/, ":***@")}).\n` +
        `Pass --force if you genuinely mean to reset it.`,
    );
  }

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();

    console.log("dropping public schema …");
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    if (files.length === 0) throw new Error("No .sql files in drizzle/");

    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8");
      process.stdout.write(`applying ${file} … `);

      // One transaction per file, so a failure names the file that broke
      // instead of aborting the batch.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
        console.log("ok");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`failed applying ${file}: ${(err as Error).message}`);
      }
    }

    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.tables
       WHERE table_schema = 'public'`,
    );
    console.log(`\npublic tables: ${rows[0].count}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});