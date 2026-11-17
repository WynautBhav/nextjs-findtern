import assert from "node:assert/strict";
import { test } from "node:test";

import { handleExpiredExport, type AiExpiryListRow, type ExpiredExportDeps } from "./expired-export.ts";
import { expiredProposals, type ExpiredSource } from "./tracker.ts";

const NOW = new Date("2026-11-26T04:30:00Z");
const DAY = 86_400_000;

const prop = (over: Partial<ExpiredSource> = {}): ExpiredSource => ({
  id: "p1",
  status: "sent",
  currency: "INR",
  offerDetails: { startDate: "2026-11-23", monthlyAmount: 12000, duration: "3m" },
  hiredAt: null,
  updatedAt: new Date("2026-11-24T05:00:00Z"),
  internId: "i1",
  internFirstName: "Asha",
  internLastName: "Rao",
  internEmail: "asha@example.com",
  employerId: "e1",
  companyName: "Acme",
  projectId: "pr1",
  projectName: "Landing page",
  projectTimezone: null,
  ...over,
});

const ai = (id: string, over: Partial<AiExpiryListRow> = {}): AiExpiryListRow => ({
  interviewId: id,
  name: `Cand ${id}`,
  email: `${id}@example.com`,
  phone: "+91 98765 43210",
  status: "scheduled",
  meetingLink: "https://app.incruiter.com/i/1",
  linkSentAt: new Date(NOW.getTime() - 8 * DAY),
  updatedAt: new Date(NOW.getTime() - 8 * DAY),
  ...over,
});

const admin = { role: "admin", permissions: ["interns:read"] };
const deps = (over: Partial<ExpiredExportDeps> = {}, proposals: ExpiredSource[] = [prop()], aiRows: AiExpiryListRow[] = [ai("a")]): ExpiredExportDeps => ({
  session: async () => admin,
  loadProposals: async (now) => expiredProposals(proposals, now),
  loadAi: async () => ({ rows: aiRows, days: 7 }),
  now: () => NOW,
  ...over,
});
const get = (qs: string, d: ExpiredExportDeps) => handleExpiredExport(new Request(`http://x.test/api/admin/expired?${qs}`), d);
const lines = (csv: string) => csv.replace(/^\uFEFF/, "").trimEnd().split("\r\n");

test("no session: 401; a role without interns:read: 403; both before anything is loaded", async () => {
  let loaded = 0;
  const spy = { loadProposals: async () => (loaded++, []), loadAi: async () => (loaded++, { rows: [], days: 7 }) };
  assert.equal((await get("type=proposals", deps({ session: async () => null, ...spy }))).status, 401);
  assert.equal((await get("type=ai", deps({ session: async () => ({ role: "intern", permissions: ["*"] }), ...spy }))).status, 401);
  for (const permissions of [[], ["reports:read"], ["transactions:read", "cms:read"]]) {
    for (const type of ["proposals", "ai"]) assert.equal((await get(`type=${type}`, deps({ session: async () => ({ role: "admin", permissions }), ...spy }))).status, 403, `${type} ${permissions}`);
  }
  assert.equal(loaded, 0);
  // interns:read and the super-admin wildcard both pass.
  assert.equal((await get("type=ai", deps())).status, 200);
  assert.equal((await get("type=ai", deps({ session: async () => ({ role: "admin", permissions: ["*"] }) }))).status, 200);
});

test("unknown or missing type is 400", async () => {
  assert.equal((await get("type=orders", deps())).status, 400);
  assert.equal((await get("", deps())).status, 400);
});

test("proposals CSV: headers, the row, BOM, download name, no-store", async () => {
  const res = await get("type=proposals", deps());
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^text\/csv/);
  assert.equal(res.headers.get("content-disposition"), 'attachment; filename="expired-offers-2026-11-26.csv"');
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual([...new Uint8Array(await res.clone().arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM so Excel reads non-ASCII");
  const text = await res.text();
  const [head, row] = lines(text);
  assert.equal(head, "Reason,Company,Project,Candidate,Candidate email,Start date,Expired at,Expired at is approximate,Days since expiry,Offer type,Offer amount,Offer amount basis,Months,Currency,Status written,Proposal id");
  assert.equal(row, "Expired · no reply before start,Acme,Landing page,Asha Rao,asha@example.com,2026-11-23,2026-11-22T18:30:00.000Z,no,3,internship,12000.00,per month,3,INR,\"no, computed on read\",p1");
});

test("CSV escaping: commas, quotes, newlines, unicode, and formula starts", async () => {
  const rows = [
    prop({ id: "a", companyName: 'Globex, "Inc."', projectName: "Line1\nLine2", internFirstName: "Zoë", internLastName: "Müller 李" }),
    prop({ id: "b", companyName: "=HYPERLINK(\"http://evil\",\"x\")", internFirstName: "+1", internLastName: "@bob" }),
  ];
  const text = await (await get("type=proposals", deps({}, rows))).text();
  assert.ok(text.includes('"Globex, ""Inc."""'));
  assert.ok(text.includes('"Line1\nLine2"'));
  assert.ok(text.includes("Zoë Müller 李"));
  assert.ok(text.includes("'=HYPERLINK"), "formula neutralised");
  assert.ok(text.includes("'+1 @bob"));
  // Embedded newline is inside quotes, so a naive split on CRLF still gives header + 2 rows.
  assert.equal(lines(text).length, 3);
});

test("proposals filters: reason, company, search and expiry range reach the file", async () => {
  const rows = [
    prop({ id: "a" }),
    prop({ id: "b", status: "accepted", employerId: "e2", companyName: "Globex" }),
    prop({ id: "c", status: "withdrawn", updatedAt: new Date("2026-11-10T10:00:00Z") }),
  ];
  const ids = async (qs: string) => lines(await (await get(`type=proposals&${qs}`, deps({}, rows))).text()).slice(1).map((l) => l.split(",").at(-1)).sort();
  assert.deepEqual(await ids(""), ["a", "b", "c"]);
  assert.deepEqual(await ids("reason=unpaid_past_start"), ["b"]);
  assert.deepEqual(await ids("company=e2"), ["b"]);
  assert.deepEqual(await ids("q=globex"), ["b"]);
  // a and b expired at 2026-11-22T18:30Z = 00:00 IST on 23 Nov: inside the 23rd, outside the 22nd.
  assert.deepEqual(await ids("from=2026-11-23&to=2026-11-30"), ["a", "b"]);
  assert.deepEqual(await ids("from=2026-11-23"), ["a", "b"]);
  assert.deepEqual(await ids("to=2026-11-22"), ["c"]);
  assert.deepEqual(await ids("from=2026-11-10&to=2026-11-10"), ["c"]);
});

test("AI CSV: link expired vs missed vs cancelled, completed and fresh links left out", async () => {
  const rows = [
    ai("old"), // sent 8 days ago, still open
    ai("fresh", { linkSentAt: new Date(NOW.getTime() - 3 * DAY) }),
    ai("done", { status: "completed" }),
    ai("missed", { status: "missed", updatedAt: new Date(NOW.getTime() - DAY / 2) }),
    ai("cancelled", { status: "cancelled", meetingLink: null, updatedAt: new Date(NOW.getTime() - 2 * DAY) }),
    ai("waiting", { status: "pending", meetingLink: null }),
  ];
  const res = await get("type=ai", deps({}, [], rows));
  assert.equal(res.headers.get("content-disposition"), 'attachment; filename="expired-ai-interviews-2026-11-26.csv"');
  const out = lines(await res.text());
  assert.equal(out[0], "Reason,Candidate,Email,Phone,Status,Link sent at,Expired at,Days since expiry,Interview id");
  assert.equal(out.length, 4);
  // Newest expiry first.
  assert.deepEqual(out.slice(1).map((l) => l.split(",").at(-1)), ["missed", "old", "cancelled"]);
  assert.ok(out[1].startsWith("Missed,"));
  assert.ok(out[2].startsWith("Link expired: not completed in 7 days,"));
  assert.ok(out[3].startsWith("Cancelled,"));
  // 8 days after sending with a 7-day window: expired one day ago.
  assert.ok(out[2].endsWith(",1,old"));
  // A cancelled row with no link has an empty "Link sent at".
  assert.ok(out[3].includes(",cancelled,,"));
});

test("AI filters: reason, search by name/phone, expiry range; the configured days apply", async () => {
  const rows = [ai("a"), ai("b", { status: "missed", updatedAt: new Date(NOW.getTime() - 2 * 3_600_000) })];
  const body = async (qs: string, days = 7) => lines(await (await get(`type=ai&${qs}`, deps({ loadAi: async () => ({ rows, days }) }, [], rows))).text()).slice(1).map((l) => l.split(",").at(-1));
  assert.deepEqual(await body("reason=missed"), ["b"]);
  assert.deepEqual(await body("q=a%40example"), ["a"]);
  assert.deepEqual(await body("q=98765"), ["b", "a"]);
  assert.deepEqual(await body("from=2026-11-26"), ["b"]);
  // 10-day window: the 8-day-old link is still live.
  assert.deepEqual(await body("", 10), ["b"]);
});

test("empty result is a header-only file, not an error; a failing loader is a plain 500 with no internals", async () => {
  const empty = await get("type=proposals", deps({}, []));
  assert.equal(empty.status, 200);
  assert.equal(lines(await empty.text()).length, 1);
  const boom = await get("type=ai", deps({ loadAi: async () => { throw new Error("connection to 10.0.0.5:5432 refused password=s3cr3t-test-value"); } }));
  assert.equal(boom.status, 500);
  const msg = await boom.text();
  assert.ok(!msg.includes("s3cr3t-test-value") && !msg.includes("10.0.0.5"));
});

test("more than 10,000 matches asks for narrower filters instead of building the file", async () => {
  const many = Array.from({ length: 10_001 }, (_, i) => prop({ id: `p${i}` }));
  const res = await get("type=proposals", deps({}, many));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /10,000/);
});
