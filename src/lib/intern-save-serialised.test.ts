import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Parallel first saves / uploads for one intern made several rows (no unique index on user_id; the schema is not
// changed because staging and production already hold duplicates). Each write now runs under a per-user advisory
// lock and reads the latest row, the same one the hire gate and admin read.
const read = (p: string) => readFileSync(p, "utf8");

test("the upload route serialises per user and reads the latest document row", () => {
  const src = read("src/app/api/uploads/route.ts");
  assert.match(src, /withInternLock/);
  assert.match(src, /desc\(schema\.internDocuments\.createdAt\)/);
  assert.match(src, /desc\(schema\.internOnboarding\.createdAt\)/);
  assert.doesNotMatch(src, /KINDS\[kindName\]/);
});

test("the onboarding save serialises per user and reads the latest row", () => {
  const src = read("src/app/api/intern/onboarding/route.ts");
  assert.match(src, /withInternLock/);
  assert.match(src, /desc\(schema\.internOnboarding\.createdAt\)/);
});

test("withInternLock takes a transaction-scoped advisory lock keyed on the user", () => {
  const src = read("src/lib/intern-save-lock.ts");
  assert.match(src, /pg_advisory_xact_lock\(hashtext\(/);
});

test("every single-row reader of an intern's documents or onboarding takes the newest row", () => {
  for (const [file, table] of [
    ["src/lib/intern-data.ts", "internDocuments"],
    ["src/lib/intern-data.ts", "internOnboarding"],
    ["src/lib/admin/candidate-documents.ts", "internDocuments"],
    ["src/app/api/intern/avatar/route.ts", "internDocuments"],
    ["src/app/api/intern/onboarding/route.ts", "internDocuments"],
    ["src/app/api/intern/onboarding/route.ts", "internOnboarding"],
  ] as const) {
    assert.match(read(file), new RegExp(`orderBy\\(desc\\(schema\\.${table}\\.createdAt\\)\\)`), `${file} ${table}`);
  }
});

test("the upload writer re-checks the card-image lock inside the lock and updates the newest row", () => {
  const src = read("src/app/api/uploads/route.ts");
  assert.match(src, /if \(cardImageLocked\(kind, doc\)\) return "locked"/);
  assert.match(src, /fillFromOlder\(rows\)/);
});
