import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(import.meta.dirname, "../../app");
const read = (p: string) => readFileSync(join(APP, p), "utf8");
const ROUTE = read("api/employer/[id]/full-time-offer/route.ts");

// No DB route harness here, so these pin the checks on the 1% campus drive full-time offer.

test("the fee rate is never read from the request body", () => {
  const schemaSrc = ROUTE.slice(ROUTE.indexOf("const bodySchema"), ROUTE.indexOf("export async function POST"));
  assert.doesNotMatch(schemaSrc, /feeRate/);
  // The only rate written is the server constant, on the drive path.
  assert.match(ROUTE, /from = \{ driveId: loaded\.drive\.id, feeRate: DRIVE_FULL_TIME_FEE \}/);
  assert.doesNotMatch(ROUTE, /feeRate: b\./);
});

test("a drive offer needs the employer's open access to the drive, a final-year student in it and its own open project", () => {
  const drive = ROUTE.slice(ROUTE.indexOf("} else {"), ROUTE.indexOf("from = { driveId"));
  assert.match(drive, /driveForEmployer\(b\.driveId!, guard\.session\)/);
  assert.match(drive, /if \(!loaded\.access\.ok\)[^\n]*status: 403/);
  // Every drive has both tracks (owner, 23 Nov): the Full-time one is the final year only, decided on the server.
  assert.match(drive, /eligibleStudents\(loaded\.drive\)\)\.find\(\(s\) => s\.userId === b\.internId\)/);
  assert.match(drive, /if \(!fullTimeReady\(student\)\)[\s\S]*?status: 422/);
  assert.match(drive, /eq\(schema\.projects\.employerId, id\)/);
  assert.match(drive, /isProjectOpen\(project\.status, project\.takenDownAt\)/);
  // The employer in the URL is the signed-in employer.
  assert.match(ROUTE, /requireMutation\(\{ req, roles: \["employer"\], ownerId: id \}\)/);
});

test("a request names a hired placement or a drive, never both", () => {
  assert.match(ROUTE, /\.refine\(\(b\) => \(b\.proposalId \? !b\.driveId : Boolean\(b\.driveId && b\.internId && b\.projectId\)\)/);
});

test("a drive offer goes only to a pool student this employer hasn't already hired", () => {
  const drive = ROUTE.slice(ROUTE.indexOf("} else {"), ROUTE.indexOf("from = { driveId"));
  assert.match(drive, /candidatePoolClauses\(\)/);
  // A hire converts through its placement, at the rate that placement was hired on (proposals.ppo_fee_percent).
  assert.match(drive, /inArray\(schema\.proposals\.status, \["accepted", "processing", "hired"\]\)/);
  // The profile shows the drive's full-time offer only for a final-year student of the drive who is not hired yet.
  const profile = read("../app/employer/intern/[id]/page.tsx");
  assert.match(profile, /relation\?\.hired \|\| relation\?\.proposal\?\.fullTime \? null : await campusCohort\(employerId\)/);
  assert.match(profile, /cohort\?\.finalYear\.has\(profile\.id\)/);
});
