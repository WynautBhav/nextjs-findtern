import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_COLS, INTERN_COLUMNS, colsFromCookie, internExportColumns, internSheet, needsBankExport, parseCols } from "./intern-columns.ts";
import { buildXlsx, readXlsxRows } from "../xlsx.ts";
import type { InternRow } from "./intern-query.ts";

const row = (over: Partial<InternRow> = {}): InternRow => ({
  id: "u1", firstName: "Asha", lastName: "Rao", email: "a@x.in", phone: "+91 9800000000", isActive: true, visibility: "live",
  createdAt: new Date("2026-11-03T23:00:00Z"), hasOnboarding: true, hasProfile: true, openToWork: true, aiStatus: "scheduled",
  interviewAt: new Date("2026-11-04T09:30:00Z"), score: 7.25, ratings: null, approval: null, offerStatus: null, hired: false,
  fullTime: false, projectStatus: null, feePaid: true,
  money: { pendingPayoutMinor: 0, totalMinor: 3_000_000, paidMinor: 1_000_000, owedMinor: 2_000_000, nextDate: "2026-12-01" },
  ...over,
});
const cells = (cols: ReturnType<typeof parseCols>, r: InternRow) => internExportColumns(cols).map((c) => c.value(r));

test("parseCols drops unknown keys, defaults on empty, all gives everything, catalog order", () => {
  assert.deepEqual([...parseCols("nope,left,email")], ["email", "left"]);
  assert.deepEqual([...parseCols("")], [...DEFAULT_COLS]);
  assert.deepEqual([...parseCols(undefined)], [...DEFAULT_COLS]);
  assert.equal(parseCols("all").size, INTERN_COLUMNS.length);
});

test("export headers: exact list with everything on, Name first, interview is two columns", () => {
  assert.deepEqual(
    internExportColumns(parseCols("all")).map((c) => c.header),
    ["Name", "Email", "Phone", "AI interview", "AI interview date (IST)", "Findtern score", "Profile", "Onboarding", "Pending payout (INR)", "Upcoming payment date", "Total to pay (INR)", "Paid till now (INR)", "Left to pay (INR)", "Live / Hidden", "Offer type", "Internship status", "Activation fee", "Offer status", "Account holder", "Account number", "IFSC", "Bank name", "UPI", "Status", "Review", "Joined"],
  );
  assert.deepEqual(internExportColumns(parseCols("left")).map((c) => c.header), ["Name", "Left to pay (INR)"]);
});

test("formats: money in rupees, IST dates, blanks, upcoming date exported", () => {
  const all = parseCols("all");
  const h = internExportColumns(all).map((c) => c.header);
  const v = cells(all, row());
  const at = (header: string) => v[h.indexOf(header)];
  assert.equal(at("Left to pay (INR)"), 20000);
  assert.equal(at("Pending payout (INR)"), 0);
  assert.equal(at("Joined"), "2026-11-04"); // 23:00 UTC is already the 4th in IST
  assert.equal(at("AI interview date (IST)"), "2026-11-04 15:00");
  assert.equal(at("Upcoming payment date"), "2026-12-01");
  assert.equal(at("Findtern score"), 7.3);
  assert.equal(at("Account number"), "");
  assert.equal(at("Review"), "Pending");
  assert.equal(at("Live / Hidden"), "Live");
});

test("offer type is blank for a non-hired row that has an offer", () => {
  const v = cells(parseCols("offerType,offerStatus"), row({ offerStatus: "sent" }));
  assert.deepEqual(v, ["Asha Rao", "", "Sent"]);
  assert.equal(cells(parseCols("offerType"), row({ hired: true }))[1], "Internship");
});

test("needsBankExport, and the cookie only counts for the same admin", () => {
  assert.equal(needsBankExport(parseCols("bankAccount")), true);
  assert.equal(needsBankExport(parseCols("bankIfsc")), false);
  assert.equal(colsFromCookie("adm1|left,next", "adm1"), "left,next");
  assert.equal(colsFromCookie("adm1|left,next", "adm2"), undefined);
});

test("xlsx file: opens back, account/IFSC/phone stay text, money has the 2-decimal style", () => {
  const cols = parseCols("phone,left,bankAccount,bankIfsc");
  const r = row({ firstName: "=SUM(A1)", bank: { holder: "", account: "001234567890123456", ifsc: "HDFC0001234", name: "", upi: "" } });
  const { rows, moneyCols } = internSheet([r], cols);
  assert.deepEqual(moneyCols, [2]);
  const file = buildXlsx("Interns", rows, moneyCols);
  assert.deepEqual(readXlsxRows(file), [
    ["Name", "Phone", "Left to pay (INR)", "Account number", "IFSC"],
    ["=SUM(A1) Rao", "+91 9800000000", "20000", "001234567890123456", "HDFC0001234"],
  ]);
  const raw = new TextDecoder("latin1").decode(file);
  assert.ok(raw.includes('<c r="C2" s="2"><v>20000</v></c>'));
  assert.ok(raw.includes('<c r="D2" t="inlineStr"><is><t xml:space="preserve">001234567890123456</t>'));
  assert.ok(raw.includes('numFmtId="2"'));
});
