import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(import.meta.dirname, "../../app");
const LIB = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");

// Owner brief (24 Nov): ending a drive is final. A closed or ended drive is never reopened, by a new link or otherwise.

test("issuing a link refuses a drive that is closed or over, before any token is made", () => {
  const src = read("api/college/drives/[id]/link/route.ts");
  const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function DELETE"));
  const guard = post.indexOf("driveDataOpen(drive)");
  assert.ok(guard > 0, "POST checks driveDataOpen");
  assert.ok(guard < post.indexOf("generateDriveToken()"), "the check comes before a token is made");
  assert.match(post, /status: 409/);
});

test("a new link never clears revokedAt", () => {
  const link = readFileSync(join(LIB, "college/link.ts"), "utf8");
  assert.doesNotMatch(link, /revokedAt:\s*null/);
});

test("the officer's Link panel offers no way back once the drive is closed", () => {
  const ui = readFileSync(join(import.meta.dirname, "../../components/college/link-actions.tsx"), "utf8");
  assert.doesNotMatch(ui, /Reopen with/i);
  assert.match(ui, /can.t be reopened/);
});
