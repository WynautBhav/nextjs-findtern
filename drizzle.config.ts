import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config.
 *
 * The schema is the single source of truth, copied verbatim from the legacy
 * `shared/schema.ts` so the new app talks to the same 35 tables the old one
 * did. No data migration step: same table names, same columns.
 */
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set to push the schema");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});