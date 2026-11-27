import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildCompanies, companiesCsv, type DriveFacts } from "./companies.ts";

const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const d = (s: string) => new Date(s);

const came = (employerId: string, company: string, email: string) => ({ employerId, company, contact: `${company} HR`, email, phone: "+91 98765 43210", joinedAt: d("2026-10-01T05:00:00Z") });
const c = (meetings = 0, offers = 0, hires = 0) => ({ meetings, offers, hires });

const drives: DriveFacts[] = [
  {
    driveId: "d1", startsAt: d("2026-09-10T04:00:00Z"),
    came: [came("e1", "Acme Pvt Ltd", "hr@acme.test"), came("e2", "Globex", "jobs@globex.test")],
    invited: [{ company: "Acme", email: "hr@acme.test" }, { company: "Initech", email: "hello@initech.test", name: "Bill", phone: "+91 90000 00001" }],
    counts: new Map([["e1", c(2, 3, 1)], ["e2", c(1, 0, 0)]]),
  },
  {
    driveId: "d2", startsAt: d("2026-11-05T04:00:00Z"),
    came: [came("e1", "Acme Pvt Ltd", "hr@acme.test")],
    invited: [{ company: "Initech", email: "HELLO@initech.test" }],
    counts: new Map([["e1", c(4, 2, 2)]]),
  },
];

test("one row per company, however many drives it came to: drives, last drive and figures are summed", () => {
  const rows = buildCompanies(drives, new Map());
  const acme = rows.find((r) => r.employerId === "e1")!;
  assert.equal(acme.drives, 2);
  assert.equal(acme.lastDriveAt.toISOString(), "2026-11-05T04:00:00.000Z");
  assert.deepEqual([acme.meetings, acme.offers, acme.hires], [6, 5, 3]);
  assert.equal(acme.joined, true);
  assert.equal(rows.filter((r) => r.company.startsWith("Acme")).length, 1, "the invite for Acme is not a second Acme");
});

test("an invited company that never came is listed once, with the contact the officer typed", () => {
  const rows = buildCompanies(drives, new Map());
  const initech = rows.filter((r) => r.company === "Initech");
  assert.equal(initech.length, 1, "invited to two drives, one row (email compared without case)");
  assert.equal(initech[0].joined, false);
  assert.equal(initech[0].employerId, null);
  assert.equal(initech[0].drives, 2);
  assert.equal(initech[0].contact, "Bill");
  assert.equal(initech[0].phone, "+91 90000 00001");
  assert.deepEqual([initech[0].meetings, initech[0].offers, initech[0].hires], [0, 0, 0]);
});

test("last seen comes from the company's own presence; companies that never came have none", () => {
  const rows = buildCompanies(drives, new Map([["e1", d("2026-11-20T10:00:00Z")]]));
  assert.equal(rows.find((r) => r.employerId === "e1")!.lastSeenAt?.toISOString(), "2026-11-20T10:00:00.000Z");
  assert.equal(rows.find((r) => r.employerId === "e2")!.lastSeenAt, null);
  assert.equal(rows.find((r) => r.company === "Initech")!.lastSeenAt, null);
});

test("most recent drive first; nothing from drives that were not passed in (another college's companies never appear)", () => {
  const other: DriveFacts = { driveId: "x", startsAt: d("2026-11-25T04:00:00Z"), came: [came("e9", "Rival Corp", "x@rival.test")], invited: [], counts: new Map() };
  const mine = buildCompanies(drives, new Map());
  assert.ok(!mine.some((r) => r.company === "Rival Corp"));
  assert.equal(mine[0].company.startsWith("Acme"), true, "Acme came to the latest drive");
  assert.ok(buildCompanies([other], new Map()).some((r) => r.company === "Rival Corp"), "the builder only knows the drives it is given");
});

test("the CSV has one header and one safe line per company, with IST dates", () => {
  const csv = companiesCsv(buildCompanies(drives, new Map([["e1", d("2026-11-20T10:00:00Z")]])));
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(lines.length, 1 + 3);
  assert.equal(lines[0], '"Company","Contact person","Email","Phone","Status","Drives","Last drive","Meets","Offers","Hires","Last seen"');
  assert.match(csv, /"Took part"/);
  assert.match(csv, /"Invited, did not join"/);
  assert.ok(csv.includes('"05 Nov 2026"'));
});

test("a company name that starts like a formula cannot run in a spreadsheet", () => {
  const csv = companiesCsv(buildCompanies([{ ...drives[0], came: [came("e1", '=HYPERLINK("http://evil")', "a@b.test")], invited: [], counts: new Map() }], new Map()));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`));
});

test("the loader reads only this college's drives and the companies that came to those drives", () => {
  const db = read("lib/college/companies-db.ts");
  assert.match(db, /eq\(schema\.collegeDrives\.collegeId, ctx\.college\.id\)/);
  assert.ok(db.includes("driveEmployerContacts(drive.id)"), "companies are read per drive of this college, never by employer");
  assert.ok(!/from\(schema\.employers\)/.test(db), "no company table scan");
});

test("the download is a server route behind the student-export permission, scoped to the officer's college, and audited", () => {
  const route = read("app/api/college/companies/export/route.ts");
  assert.match(route, /requireCollegeMutation\(req, "students:export"\)/);
  assert.ok(route.includes("companiesForCollege(g.ctx)"));
  assert.ok(route.includes("auditCollegeView("));
  assert.ok(!/ctx\.college\.id\s*=|collegeId:\s*(body|parsed)/.test(route), "the college never comes from the request");
});
