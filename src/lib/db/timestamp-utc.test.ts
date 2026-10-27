import { test } from "node:test";
import assert from "node:assert/strict";

// Run as an IST server would: the bug only shows when local time isn't UTC.
process.env.TZ = "Asia/Kolkata";
const SEED_URL = process.env.TIMESTAMP_TEST_DATABASE_URL ?? "postgresql://findtern:findtern_dev@localhost:5432/findtern";
process.env.DATABASE_URL = SEED_URL;

const pg = (await import("pg")).default;
const { sql, eq } = await import("drizzle-orm");
const { getDb, schema, utcTypes, dbTimestamp } = await import("./index.ts");

test("dbTimestamp reads Drizzle's zone-less raw strings as UTC", () => {
  assert.equal(new Date().getTimezoneOffset(), -330, "test must run with TZ=Asia/Kolkata");
  const iso = (v: unknown) => dbTimestamp(v)?.toISOString() ?? null;
  assert.equal(iso("2026-10-27 10:15:36.905882"), "2026-10-27T10:15:36.905Z");
  assert.equal(iso("2026-10-27 10:15:36"), "2026-10-27T10:15:36.000Z");
  assert.equal(iso("2026-10-27T10:15:36"), "2026-10-27T10:15:36.000Z");
  // Explicit zones are respected.
  assert.equal(iso("2026-10-27T10:15:36.000Z"), "2026-10-27T10:15:36.000Z");
  assert.equal(iso("2026-10-27 10:15:36+00"), "2026-10-27T10:15:36.000Z");
  assert.equal(iso("2026-10-27 15:45:36+05:30"), "2026-10-27T10:15:36.000Z");
  // Dates pass through; junk is null.
  const d = new Date("2026-10-27T10:15:36Z");
  assert.equal(dbTimestamp(d), d);
  for (const bad of [null, undefined, "", "yesterday", "2026-10-27", 42, new Date("x")]) assert.equal(dbTimestamp(bad), null, String(bad));
});

test("pool parser: timestamp text as UTC; other types unchanged", () => {
  const parse = utcTypes.getTypeParser(pg.types.builtins.TIMESTAMP, "text") as (v: string) => Date;
  assert.equal(parse("2026-10-27 10:15:36.905882").toISOString(), "2026-10-27T10:15:36.905Z");
  assert.equal(utcTypes.getTypeParser(pg.types.builtins.INT4, "text")("42"), 42);
});

async function reachable(): Promise<string | null> {
  const c = new pg.Client({ connectionString: SEED_URL, connectionTimeoutMillis: 2000 });
  c.on("error", () => {});
  try {
    await c.connect();
    await c.query("select 1 from users limit 1");
    return null;
  } catch (err) {
    return (err as Error).message || (err as { code?: string }).code || "connection failed";
  } finally {
    await c.end().catch(() => {});
  }
}
const why = await reachable();
const skip = why ? `seed DB unreachable at ${SEED_URL.replace(/:[^:@/]+@/, ":***@")} (${why})` : false;

test("same row: builder Date === dbTimestamp(raw db.execute string), and it's the true instant (seed DB)", { skip }, async () => {
  const db = getDb();
  const [row] = await db.select({ id: schema.users.id, createdAt: schema.users.createdAt }).from(schema.users).limit(1);
  assert.ok(row, "seed DB has no users");
  const raw = (await db.execute(sql`SELECT created_at, extract(epoch from created_at)::text AS epoch FROM users WHERE id = ${row.id}`))
    .rows[0] as { created_at: unknown; epoch: string };
  // Raw rows stay strings; the helper is how callers turn them into instants.
  assert.equal(typeof raw.created_at, "string");
  const viaHelper = dbTimestamp(raw.created_at);
  assert.equal(viaHelper?.getTime(), row.createdAt.getTime(), "helper disagrees with the builder");
  assert.ok(Math.abs(row.createdAt.getTime() - Number(raw.epoch) * 1000) < 1, "builder is not the true instant");
  // What the helper prevents: new Date() on the raw string is 5h30 off here.
  assert.equal(new Date(raw.created_at as string).getTime() - row.createdAt.getTime(), -330 * 60_000);
  const [again] = await db.select({ createdAt: schema.users.createdAt }).from(schema.users).where(eq(schema.users.id, row.id));
  assert.equal(again.createdAt.getTime(), row.createdAt.getTime());
});

test("direct pg use: a pool with utcTypes is UTC; the default parser is 5h30 off (seed DB)", { skip }, async () => {
  const text = "SELECT created_at, extract(epoch from created_at)::text AS epoch FROM users LIMIT 1";
  const fixed = new pg.Pool({ connectionString: SEED_URL, options: "-c TimeZone=UTC", max: 1, types: utcTypes });
  const plain = new pg.Pool({ connectionString: SEED_URL, options: "-c TimeZone=UTC", max: 1 });
  try {
    const a = (await fixed.query(text)).rows[0];
    const b = (await plain.query(text)).rows[0];
    assert.ok(Math.abs(a.created_at.getTime() - Number(a.epoch) * 1000) < 1);
    assert.ok(Math.abs(b.created_at.getTime() - Number(b.epoch) * 1000 + 330 * 60_000) < 1);
  } finally {
    await fixed.end();
    await plain.end();
  }
});

test.after(async () => {
  if (why) return;
  const client = (getDb() as unknown as { $client?: { end(): Promise<void> } }).$client;
  await client?.end().catch(() => {});
});
