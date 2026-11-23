import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-chars-long";

const { invoiceNeeded, rosterLinkBlock } = await import("../drives/admin-rules.ts");

const COLLEGE = "college-a";

test("WP4-04: a seat batch with nothing to pay takes no GST invoice serial", () => {
  assert.equal(invoiceNeeded(0), false, "100% credit: no invoice, no serial");
  assert.equal(invoiceNeeded(1), true, "even Re 0.01 is a supply");
  assert.equal(invoiceNeeded(94400), true);
});

test("WP4-01..03: confirm links a roster row to an account only when that account may take this college", () => {
  const none = { membership: null, denied: false };
  assert.equal(rosterLinkBlock(COLLEGE, none), null, "no membership at all: link and verify");
  assert.equal(rosterLinkBlock(COLLEGE, { membership: { collegeId: COLLEGE, leftAt: null }, denied: false }), null, "own live membership: link");
  assert.equal(rosterLinkBlock(COLLEGE, { membership: { collegeId: "college-b", leftAt: new Date() }, denied: false }), null, "left another college: link (the TPO approval list offers them too)");
  assert.equal(rosterLinkBlock(COLLEGE, { membership: { collegeId: "college-b", leftAt: null }, denied: false }), "other_college", "member of another college: never link");
  assert.equal(rosterLinkBlock(COLLEGE, { membership: { collegeId: COLLEGE, leftAt: new Date() }, denied: false }), "left", "left THIS college: leaving is a decision, an import does not undo it");
  assert.equal(rosterLinkBlock(COLLEGE, { membership: null, denied: true }), "denied", "denied by the placement office: only a restore brings them back");
  assert.equal(rosterLinkBlock(COLLEGE, { membership: { collegeId: COLLEGE, leftAt: null }, denied: true }), "denied");
});

test("WP4 IST edges: the invoice number carries the IST day, not the UTC day", async () => {
  const { formatInvoiceNumber, invoiceDate } = await import("../invoice.ts");
  // 23 Nov 2026 00:30 IST is still 22 Nov 19:00 UTC
  assert.equal(formatInvoiceNumber(new Date("2026-11-22T19:00:00Z"), 7), "231126-07");
  // 23 Nov 2026 23:59 IST = 18:29 UTC the same day
  assert.equal(formatInvoiceNumber(new Date("2026-11-23T18:29:59Z"), 8), "231126-08");
  // one second later it is 24 Nov in India
  assert.equal(formatInvoiceNumber(new Date("2026-11-23T18:30:00Z"), 9), "241126-09");
  // new year in India (1 Jan 00:00 IST = 31 Dec 18:30 UTC)
  assert.equal(formatInvoiceNumber(new Date("2026-12-31T18:30:00Z"), 1), "010127-01");
  assert.equal(invoiceDate(new Date("2026-11-22T19:00:00Z")), "23-11-26");
});
