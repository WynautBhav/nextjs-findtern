/**
 * Import the AISHE higher-education directory into `colleges`.
 *
 * Source: data/colleges/aishe-institutions.json.gz (AISHE, Ministry of
 * Education / NIC, https://dashboard.aishe.gov.in/hedirectory/; public
 * government data, no personal data; the file records its fetch date).
 *
 * Idempotent. Upserts by aishe_code. Partner colleges are never modified, and
 * is_partner, email_domains, logo_url, show_on_website, sort_order, is_active
 * and slug are never written on an existing row. A hand-added college with no
 * AISHE code (e.g. the demo seed) that matches an imported name + city adopts
 * the code instead of being duplicated.
 *
 * Usage: DATABASE_URL=… node --experimental-strip-types scripts/import-colleges.ts
 * (npm run db:import-colleges: local database unless DATABASE_URL is set).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import pg from "pg";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to import with NODE_ENV=production");

const FILE = join(process.cwd(), "data", "colleges", "aishe-institutions.json.gz");
const BATCH = 1000;

type Row = { code: string; name: string; city: string | null; state: string };

const tidy = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const SMALL = new Set(["of", "and", "for", "the", "in", "at", "on", "to", "by", "cum"]);
/** Only shouting names are re-cased; mixed-case names are left as the source has them. */
function recase(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (!letters || letters.replace(/[^A-Z]/g, "").length / letters.length < 0.8) return s;
  return s
    .toLowerCase()
    .replace(/[a-z][a-z']*/g, (w, i: number) => (i > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
}
const norm = (s: unknown) => recase(tidy(s));
const key = (name: string, city: string | null) => `${name.toLowerCase()}|${(city ?? "").toLowerCase()}`;

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");

function load(): Row[] {
  const file = JSON.parse(gunzipSync(readFileSync(FILE)).toString("utf8")) as { columns: string[]; rows: string[][] };
  if (file.columns.join() !== "aisheCode,name,city,state") throw new Error("Unexpected columns");
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const [code, name, city, state] of file.rows) {
    const r: Row = { code: tidy(code).toUpperCase(), name: norm(name).slice(0, 200), city: norm(city) || null, state: norm(state) };
    if (!/^[CSU]-\d{1,6}$/.test(r.code) || r.name.length < 3 || !r.state || seen.has(r.code)) continue;
    seen.add(r.code);
    out.push(r);
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const rows = load();
  const pool = new pg.Pool({ connectionString: url, options: "-c TimeZone=UTC", max: 1 });
  const client = await pool.connect();
  const stat = { inserted: 0, updated: 0, adopted: 0, unchanged: 0 };
  try {
    await client.query("BEGIN");
    const { rows: existing } = await client.query<{ id: string; aishe_code: string | null; slug: string; name: string; city: string | null }>(
      "SELECT id, aishe_code, slug, name, city FROM colleges",
    );
    const slugs = new Set(existing.map((e) => e.slug));
    const haveCode = new Set(existing.filter((e) => e.aishe_code).map((e) => e.aishe_code as string));
    // Hand-added rows with no code, by name + city.
    const uncoded = new Map(existing.filter((e) => !e.aishe_code).map((e) => [key(e.name, e.city), e.id]));

    const fresh: (Row & { slug: string })[] = [];
    for (const r of rows) {
      const adoptId = haveCode.has(r.code) ? undefined : uncoded.get(key(r.name, r.city));
      if (adoptId) {
        uncoded.delete(key(r.name, r.city));
        await client.query("UPDATE colleges SET aishe_code = $1 WHERE id = $2 AND aishe_code IS NULL", [r.code, adoptId]);
        stat.adopted++;
        continue;
      }
      if (haveCode.has(r.code)) {
        fresh.push({ ...r, slug: "" }); // existing row: slug is never rewritten, the upsert only refreshes name/city/state
        continue;
      }
      // name, then name-city, then name-code: the code is unique, so the last always works.
      const base = slugify(r.name) || "college";
      const candidates = [base, slugify(`${r.name} ${r.city ?? ""}`), `${base.slice(0, 70)}-${r.code.toLowerCase()}`];
      const slug = candidates.find((c) => c && !slugs.has(c)) ?? `${r.code.toLowerCase()}`;
      slugs.add(slug);
      fresh.push({ ...r, slug });
    }

    for (let i = 0; i < fresh.length; i += BATCH) {
      const b = fresh.slice(i, i + BATCH);
      const res = await client.query<{ inserted: boolean }>(
        `INSERT INTO colleges (name, city, state, aishe_code, slug)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
         ON CONFLICT (aishe_code) WHERE aishe_code IS NOT NULL DO UPDATE
           -- A casing-only difference keeps the stored name (hand-curated names such as "JECRC University").
           SET name = CASE WHEN lower(colleges.name) = lower(excluded.name) THEN colleges.name ELSE excluded.name END,
               city = excluded.city, state = excluded.state
           WHERE NOT colleges.is_partner
             AND (lower(colleges.name), colleges.city, colleges.state) IS DISTINCT FROM (lower(excluded.name), excluded.city, excluded.state)
         RETURNING (xmax = 0) AS inserted`,
        [b.map((r) => r.name), b.map((r) => r.city), b.map((r) => r.state), b.map((r) => r.code), b.map((r) => r.slug)],
      );
      for (const r of res.rows) stat[r.inserted ? "inserted" : "updated"]++;
    }
    stat.unchanged = fresh.length - stat.inserted - stat.updated;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
  console.log(`AISHE rows in file: ${rows.length}`, stat);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
