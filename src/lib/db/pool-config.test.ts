import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// createDb() builds its pool lazily from DATABASE_URL and is not exported, so the settings are checked in the source.
const src = readFileSync(join(process.cwd(), "src", "lib", "db", "index.ts"), "utf8");

test("the pool gives a busy request 8 s for a connection, not forever and not 5 s", () => {
  assert.match(src, /connectionTimeoutMillis: 8_000/);
});

test("the pool has an error listener, so a dropped idle client cannot crash the process", () => {
  assert.match(src, /pool\.on\("error"/);
});
