// Static migration/schema safety net. No database: reads drizzle/*.sql and the drizzle schema files as text.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const SQL_DIR = join(ROOT, "drizzle");
const DB_DIR = join(ROOT, "src", "lib", "db");
const read = (p: string) => readFileSync(p, "utf8");

/** Documented drift. Each key is a rule-specific id; the value is why it is accepted. New drift fails. */
const KNOWN_MISMATCHES: Record<string, string> = {
  "sqlonly:projects_status_check":
    "0024 adds this CHECK with NOT VALID via a DO block; it is deliberately not modelled in schema.ts (legacy values).",
  "sqlonly:email_outbox_idempotency_key_unique":
    "Named UNIQUE constraint in 0021 is produced by drizzle's implicit .unique() on idempotencyKey (default name matches).",
};

/** Exact (whitespace-normalised) UPDATE/DELETE statements permitted in 0018-0027. */
const ALLOWED_DML = new Set([
  `UPDATE "projects" SET "status" = 'published', "published_at" = COALESCE("published_at", "created_at") WHERE "status" = 'active';`,
  `UPDATE "projects" SET "status" = 'paused' WHERE "status" = 'inactive';`,
  `UPDATE "projects" SET "status" = 'closed' WHERE "status" = 'archived';`,
]);


const files = readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort();
const NEW = files.filter((f) => {
  const n = Number(f.slice(0, 4));
  return n >= 18 && n <= 27;
});

// Same split/strip as scripts/migrate.ts statements().
const split = (sql: string) =>
  sql.split("--> statement-breakpoint").map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** "table.column" added by ALTER TABLE ... ADD COLUMN in any of these files: a CREATE TABLE in an earlier file may lack it. */
const ALTER_ADDED = new Set(
  NEW.flatMap((f) =>
    [...read(join(SQL_DIR, f)).matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)"/g)].map((m) => `${m[1]}.${m[2]}`),
  ),
);

const DRIZZLE_FILES: Record<string, string> = Object.fromEntries(
  readdirSync(DB_DIR)
    .filter((f) => /^schema(-[a-z-]+)?\.ts$/.test(f))
    .map((f) => [f, read(join(DB_DIR, f))]),
);
const ALL_DRIZZLE = Object.values(DRIZZLE_FILES).join("\n");

/** Column name -> notNull for a drizzle pgTable, one column per line. */
function drizzleColumns(table: string): Map<string, boolean> {
  const start = ALL_DRIZZLE.search(new RegExp(`pgTable\\(\\s*"${table}"`));
  assert.ok(start >= 0, `no drizzle pgTable for ${table}`);
  const rest = ALL_DRIZZLE.slice(start + 1);
  const next = rest.search(/pgTable\(/);
  const block = next < 0 ? rest : rest.slice(0, next);
  const cols = new Map<string, boolean>();
  for (const line of block.split("\n")) {
    const m = line.match(/\b(?:varchar|text|integer|timestamp|jsonb|boolean|bigserial)\("([a-z0-9_]+)"/);
    if (m && !/^\s*(uniqueIndex|index|check)\(/.test(line)) {
      cols.set(m[1], /notNull\(\)|primaryKey\(\)/.test(line));
    }
  }
  return cols;
}

function sqlTables(sql: string) {
  const out: { table: string; cols: Map<string, boolean> }[] = [];
  for (const stmt of split(sql)) {
    const m = stmt.match(/^CREATE TABLE IF NOT EXISTS "(\w+)" \(([\s\S]*)\);?$/);
    if (!m) continue;
    const cols = new Map<string, boolean>();
    for (const line of m[2].split("\n")) {
      const c = line.match(/^\s*"(\w+)" (.*?),?$/);
      if (c) cols.set(c[1], /NOT NULL|PRIMARY KEY/.test(c[2]));
    }
    out.push({ table: m[1], cols });
  }
  return out;
}

describe("migration files 0018-0027", () => {
  it("are present", () => assert.equal(NEW.length, 10));

  for (const f of NEW) {
    const sql = read(join(SQL_DIR, f));
    const stmts = split(sql);

    it(`${f}: lock_timeout first, statements well-formed`, () => {
      assert.match(stmts[0], /^SET LOCAL lock_timeout = '\d+s';$/);
      for (const s of stmts) assert.ok(s.endsWith(";"), `statement does not end with ';': ${s.slice(0, 60)}`);
      // Every raw chunk after splitting must contain something executable.
      assert.ok(stmts.length > 1);
    });

    it(`${f}: idempotent DDL`, () => {
      for (const s of stmts) {
        if (/^CREATE TABLE/i.test(s)) assert.match(s, /^CREATE TABLE IF NOT EXISTS "/, s.slice(0, 60));
        if (/^CREATE (UNIQUE )?INDEX/i.test(s)) assert.match(s, /^CREATE (UNIQUE )?INDEX IF NOT EXISTS "/, s.slice(0, 60));
        if (/ADD COLUMN/i.test(s)) assert.match(s, /ADD COLUMN IF NOT EXISTS "/, s.slice(0, 60));
      }
    });

    it(`${f}: identifiers are quoted (none can be a reserved word)`, () => {
      for (const s of stmts) {
        for (const m of s.matchAll(/\b(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE|ON(?! CONFLICT)|ADD COLUMN IF NOT EXISTS|INDEX IF NOT EXISTS)\s+(\S+)/g)) {
          assert.ok(m[1].startsWith('"'), `unquoted identifier ${m[1]} in ${s.slice(0, 60)}`);
        }
        const body = s.match(/^CREATE TABLE IF NOT EXISTS "\w+" \(([\s\S]*)\);$/);
        if (body) {
          for (const line of body[1].split("\n").map((l) => l.trim()).filter(Boolean)) {
            assert.ok(line.startsWith('"') || line.startsWith("CONSTRAINT "), `unquoted column line: ${line}`);
          }
        }
      }
    });

    it(`${f}: data safety`, () => {
      for (const s of stmts) {
        assert.doesNotMatch(s, /\bDROP\s+(TABLE|COLUMN)\b/i, s.slice(0, 60));
        assert.doesNotMatch(s, /\bTRUNCATE\b/i, s.slice(0, 60));
        if (/^(UPDATE|DELETE)\b/i.test(s)) {
          assert.match(s, /\bWHERE\b/i, `DML without WHERE: ${s.slice(0, 60)}`);
          assert.ok(ALLOWED_DML.has(norm(s)), `DML not allow-listed: ${norm(s)}`);
        }
      }
    });

    it(`${f}: tables, constraints and indexes match drizzle`, () => {
      for (const { table, cols } of sqlTables(sql)) {
        const d = drizzleColumns(table);
        for (const [name, nn] of cols) {
          assert.ok(d.has(name), `${table}.${name} in SQL but not in drizzle`);
          assert.equal(d.get(name), nn, `${table}.${name} notNull differs (sql=${nn})`);
        }
        for (const name of d.keys()) assert.ok(cols.has(name) || ALTER_ADDED.has(`${table}.${name}`), `${table}.${name} in drizzle but not in SQL`);
      }
      for (const s of stmts) {
        const names = [
          ...[...s.matchAll(/CONSTRAINT "(\w+)"/g)].map((m) => m[1]),
          ...[...s.matchAll(/^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]),
        ];
        for (const n of names) {
          if (ALL_DRIZZLE.includes(`"${n}"`)) continue;
          assert.ok(KNOWN_MISMATCHES[`sqlonly:${n}`], `${n} (${f}) is in SQL but not in any drizzle schema file`);
        }
      }
    });
  }

  it("added columns exist in schema.ts", () => {
    const s = DRIZZLE_FILES["schema.ts"];
    for (const c of ["drive_order_id", "order_id", "rejection_reason", "submitted_at", "published_at"]) {
      assert.ok(s.includes(`"${c}"`), c);
    }
    assert.match(s, /driveOrderId: varchar\("drive_order_id"\)/);
    assert.match(s, /rejectionReason: text\("rejection_reason"\)/);
    for (const c of ["description", "taken_down_at", "taken_down_by", "taken_down_reason"]) assert.ok(s.includes(`"${c}"`), c);
  });

  it("0027 adds user_presence.show_activity: boolean NOT NULL DEFAULT TRUE, additive, matching drizzle", () => {
    const stmts = split(read(join(SQL_DIR, "0027_presence_visibility.sql")));
    assert.ok(stmts.some((s) => norm(s) === 'ALTER TABLE "user_presence" ADD COLUMN IF NOT EXISTS "show_activity" boolean DEFAULT true NOT NULL;'));
    assert.match(DRIZZLE_FILES["schema-messaging.ts"], /showActivity: boolean\("show_activity"\)\.notNull\(\)\.default\(true\)/);
    assert.equal(drizzleColumns("user_presence").get("show_activity"), true);
    const down = read(join(SQL_DIR, "rollback", "0027_presence_visibility.down.sql"));
    assert.match(down, /DROP COLUMN IF EXISTS "show_activity"/);
  });

  it("every 0018-0027 migration after 0024 has a rollback file", () => {
    for (const f of NEW.filter((x) => Number(x.slice(0, 4)) >= 25)) {
      const down = join(SQL_DIR, "rollback", f.replace(/\.sql$/, ".down.sql"));
      assert.ok(readFileSync(down, "utf8").includes(`DELETE FROM "_ft_migrations" WHERE "name" = '${f}'`), down);
    }
  });

  it("KNOWN_MISMATCHES entries are still needed", () => {
    for (const k of Object.keys(KNOWN_MISMATCHES)) {
      const name = k.replace("sqlonly:", "");
      const inSql = NEW.some((f) => read(join(SQL_DIR, f)).includes(`"${name}"`));
      assert.ok(inSql, `stale KNOWN_MISMATCHES entry ${k}`);
    }
  });
});

describe("migration numbering and schema exports", () => {
  it("is contiguous and unique except the 0007 pair", () => {
    const nums = files.map((f) => Number(f.slice(0, 4)));
    const counts = new Map<number, number>();
    for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
    const dups = [...counts].filter(([, c]) => c > 1).map(([n]) => n);
    assert.deepEqual(dups, [7]);
    assert.equal(counts.get(7), 2);
    const uniq = [...counts.keys()].sort((a, b) => a - b);
    uniq.forEach((n, i) => assert.equal(n, i, `gap before ${n}`));
  });

  it("re-exports every schema-*.ts from schema.ts", () => {
    for (const f of Object.keys(DRIZZLE_FILES).filter((x) => x.startsWith("schema-"))) {
      assert.ok(DRIZZLE_FILES["schema.ts"].includes(`export * from "./${f}"`), `${f} not re-exported`);
    }
  });
});

describe("rollback files for 0018-0027", () => {
  const RB_DIR = join(SQL_DIR, "rollback");
  const rbFiles = readdirSync(RB_DIR).filter((f) => f.endsWith(".down.sql"));

  it("every migration has drizzle/rollback/<same name>.down.sql and no orphans", () => {
    for (const f of NEW) assert.ok(rbFiles.includes(f.replace(/\.sql$/, ".down.sql")), `no rollback for ${f}`);
    for (const r of rbFiles) assert.ok(files.includes(r.replace(/\.down\.sql$/, ".sql")), `orphan rollback ${r}`);
  });

  for (const r of rbFiles) {
    const sql = read(join(RB_DIR, r));
    const up = r.replace(/\.down\.sql$/, ".sql");
    const code = sql.replace(/^\s*--.*$/gm, "");

    it(`${r}: lock_timeout, idempotent drops, unregisters the migration`, () => {
      assert.match(code.trim(), /^SET LOCAL lock_timeout = '\d+s';/);
      for (const m of code.matchAll(/\bDROP (TABLE|INDEX|CONSTRAINT|COLUMN)\b(?! IF EXISTS)/g)) {
        assert.fail(`${r}: DROP ${m[1]} without IF EXISTS`);
      }
      assert.ok(code.includes(`DELETE FROM "_ft_migrations" WHERE "name" = '${up}';`), `${r} does not unregister ${up}`);
    });

    // 0018-0024 destroy data; the earlier 0025-0027 files carry their own warnings.
    if (Number(r.slice(0, 4)) <= 24) {
      it(`${r}: header warns that it destroys data`, () => {
        assert.match(sql, /^-- DESTROYS DATA:/m);
      });
    }
  }
});
