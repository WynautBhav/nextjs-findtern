import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDriveBoard, mergeShortlist, type DriveStudentRef } from "./drive-board.ts";

const NOW = Date.parse("2026-11-27T10:00:00Z");
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000);
const stu = (id: string): DriveStudentRef => ({ userId: id, name: `Student ${id}`, rollNo: null, year: 4, branch: "CSE", phone: null });
const students = ["a", "b", "c", "d"].map(stu);

// Bug sheet 27 Nov, item 27: "shortlist candidates were 8 but shows 0". A company's shortlist lives in two places: the
// drive's own list and the regular Shortlist button. The employer's page counts the regular one; the officer's board
// counted only the drive's list, which no screen writes to.
test("one shortlist per (company, student) however many lists hold it; the earliest time wins", () => {
  const own = [{ userId: "a", employerId: "e1", createdAt: at(10) }];
  const regular = [
    { userId: "a", employerId: "e1", createdAt: at(30) },
    { userId: "a", employerId: "e2", createdAt: at(5) },
    { userId: "b", employerId: "e1", createdAt: at(20) },
  ];
  const merged = mergeShortlist(own, regular);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((r) => r.userId === "a" && r.employerId === "e1")!.createdAt.getTime(), at(30).getTime());
});

test("the Shortlisted card is the length of the list it opens, whichever list the shortlist came from", () => {
  // Only the regular shortlist has rows (the owner's case): the drive's own list is empty.
  const shortlist = mergeShortlist([], [
    { userId: "a", employerId: "e1", createdAt: at(30) },
    { userId: "a", employerId: "e2", createdAt: at(20) },
    { userId: "b", employerId: "e1", createdAt: at(10) },
  ]).map((r) => ({ userId: r.userId, company: r.employerId === "e1" ? "Acme" : "Beta", createdAt: r.createdAt }));
  const b = buildDriveBoard({ students, meetings: [], offers: [], offline: null, shortlist, now: NOW });
  assert.equal(b.shortlistCount, 2, "two students, one of them shortlisted by two companies");
  assert.equal(b.lists.shortlisted.length, b.shortlistCount);
  assert.match(b.lists.shortlisted.find((s) => s.userId === "a")!.detail, /Acme/);
  // A student outside the drive never counts.
  const out = buildDriveBoard({ students, meetings: [], offers: [], offline: null, shortlist: [{ userId: "zz", company: "Acme", createdAt: at(1) }], now: NOW });
  assert.equal(out.shortlistCount, 0);
});

// Item 28: "Offers sent" is every offer made, so an accepted offer plus a withdrawn one is 2.
test("Offers sent counts every offer including withdrawn ones, and its list is the same students", () => {
  const b = buildDriveBoard({
    students,
    meetings: [],
    offers: [
      { userId: "a", company: "Acme", status: "accepted", hired: false, fullTime: true, createdAt: at(60) },
      { userId: "b", company: "Beta", status: "withdrawn", hired: false, fullTime: false, createdAt: at(50) },
    ],
    offline: null,
    now: NOW,
  });
  assert.equal(b.offerCounts.sent, 2);
  assert.equal(b.offerCounts.accepted, 1);
  assert.equal(b.offerCounts.withdrawn, 1);
  assert.deepEqual(b.lists.offersSent.map((s) => s.userId).sort(), ["a", "b"]);
  assert.match(b.lists.offersSent.find((s) => s.userId === "b")!.detail, /1 withdrawn/);
  // "Got an offer" is unchanged: a withdrawn offer is not an offer there.
  assert.deepEqual(b.lists.offers.map((s) => s.userId), ["a"]);
});

// Item 26: the reason a meeting was called off is shown to the TPO, line breaks kept.
test("a called-off meet shows who called it off and why, with the reason's line breaks", () => {
  const b = buildDriveBoard({
    students,
    meetings: [
      { userId: "a", company: "Acme", status: "cancelled", createdAt: at(40), reason: "Role filled.\nWe will write again in Jan.", cancelledBy: "employer" },
      { userId: "b", company: "Beta", status: "cancelled", createdAt: at(30), reason: "Clash with exam", cancelledBy: "intern" },
      { userId: "c", company: "Gamma", status: "cancelled", createdAt: at(20) },
    ],
    offers: [],
    offline: null,
    now: NOW,
  });
  const detail = (id: string) => b.lists.meetCancelled.find((s) => s.userId === id)!.detail;
  assert.equal(detail("a"), "Acme: Withdrawn\nReason: Role filled.\nWe will write again in Jan.");
  assert.equal(detail("b"), "Beta: Withdrawn\nStudent's reason: Clash with exam");
  assert.equal(detail("c"), "Gamma: Withdrawn", "no reason on file: nothing invented");
  assert.equal(b.lists.meetCancelled.length, b.meetCounts.cancelled);
});

// The class behind item 27: one number, two definitions. Only the loader may read the drive shortlist table, so every
// "shortlisted" figure on every screen goes through loadDriveShortlist.
test("only the shortlist loader and the employer's own shortlist route read the drive shortlist table", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const readers = (readdirSync("src", { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
    .filter((f) => readFileSync(`src/${f}`, "utf8").includes("collegeDriveShortlist"))
    .map((f) => f.replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(readers, ["app/api/employer/drives/[id]/shortlist/route.ts", "lib/college/drive-board-db.ts", "lib/db/schema.ts"]);
});
