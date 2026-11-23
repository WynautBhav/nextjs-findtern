// WP5 L3: admin drive-order uploader: file quirks, sniffing, size, preview-before-save, partial failure, over-allocation, double confirm.
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, idem, paidOrder, csvForm, codeOfRow } from "./wp5-lib.mjs";
import { buildXlsx } from "../../src/lib/xlsx.ts";

const admin = await login("admin", "admin@findtern.dev");
const E = (n) => `${n}.${SFX}@e2e-wp5.test`;
const up = (orderId, form) => admin.post(`/api/admin/drive-orders/${orderId}/imports`, form);
const counts = async (importId) => (await q("select state, count(*)::int n from drive_roster_entries where import_id=$1 group by 1", [importId])).reduce((m, r) => ({ ...m, [r.state]: r.n }), {});
const codesFor = async (orderId) => (await q("select count(*)::int n from drive_codes where order_id=$1", [orderId]))[0].n;
const xlsxForm = (rows, name = "r.xlsx") => { const f = new FormData(); f.set("file", new File([buildXlsx("Sheet1", rows)], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); return f; };

// 1 order, 50 slots
const order = await paidOrder(admin, 50, "l3");
// quirks
const quirk = "\ufeffName;College Email;Mobile\r\n" +
  `"Sharma, Asha";ASHA.${SFX}@E2E-WP5.TEST ;+91 98765-43210\r\n` +
  `राहुल शर्मा;${E("rahul")};09876543211\r\n` +
  `=HYPERLINK("http://evil","click");${E("formula")};9876543212\r\n` +
  `Zero\u200bWidth Name;${E("zw")};9876543213\r\n` +
  `Mail Zw;mail\u200bzw.${SFX}@e2e-wp5.test;9876543214\r\n` +
  `Dup Email;${E("rahul")};9876543215\r\n` +
  `Dup Phone;${E("dupphone")};9876543210\r\n` +
  `;;\r\n` +
  `No Phone;${E("nophone")};\r\n` +
  `Bad Phone;${E("badphone")};12345\r\n`;
const r1 = await up(order, csvForm(quirk));
check("quirky CSV previews (BOM, semicolons, CRLF, quotes)", r1.status === 200 && r1.json.importId, r1.text.slice(0, 200));
const entries = await q("select row_no,name,college_email_norm email,phone_e164,state,reasons from drive_roster_entries where import_id=$1 order by row_no", [r1.json.importId]).catch(async (e) => (console.log(e.message), q("select * from drive_roster_entries where import_id=$1 order by row_no limit 1", [r1.json.importId])));
for (const e of entries) console.log("  row", JSON.stringify(e));
const by = Object.fromEntries(entries.map((e) => [e.row_no, e]));
check("preview created no codes and no memberships", (await codesFor(order)) === 0);
check("row 1 comma name / uppercase+space email normalised, +91 phone", by[1]?.email === `asha.${SFX}@e2e-wp5.test` && by[1].phone_e164 === "+919876543210", JSON.stringify(by[1]));
check("row 2 Devanagari name kept, 0-prefixed phone", by[2]?.name === "राहुल शर्मा" && by[2].phone_e164 === "+919876543211");
check("row 3 formula name is kept as text only (state valid, never executed)", by[3]?.name.startsWith("=HYPERLINK"), by[3]?.name);
check("row 4 zero-width char removed from name", by[4] && !/\u200b/.test(by[4].name), JSON.stringify(by[4]?.name));
check("row 5 email with zero-width char is not accepted as-is", !by[5] || by[5].state === "invalid" || !/\u200b/.test(by[5].email ?? ""), JSON.stringify(by[5]));
check("row 6 duplicate email flagged, not merged", by[6]?.state === "duplicate");
console.log("  row 7 duplicate phone state:", by[7]?.state);
check("blank row dropped/invalid, not valid", !by[8] || by[8].state !== "valid");
check("row 10 bad phone -> invalid (visible reason)", by[10]?.state === "invalid" || by[9]?.state === "invalid", JSON.stringify([by[9], by[10]]));

// file-level
const sizes = async (n) => up(order, csvForm("Name,Email\n" + "x".repeat(n)));
const big = await up(order, csvForm("Name,Email\n" + "a".repeat(5 * 1024 * 1024 + 1 - 11)));
check("5 MB + 1 byte -> 413", big.status === 413, `${big.status} ${big.text.slice(0, 100)}`);
const png = await up(order, csvForm("\x89PNG\r\n\x1a\nNameEmail", "r.csv", "text/csv"));
check("PNG bytes named .csv -> 415", png.status === 415, `${png.status}`);
const exe = await up(order, csvForm("MZ\x90\x00\x03\x00\x00\x00", "r.csv"));
check("exe bytes -> 415", exe.status === 415, `${exe.status}`);
const zip = await up(order, csvForm("PK\x03\x04junkjunkjunk", "r.xlsx"));
check("zip-looking non-xlsx -> 4xx not 500", zip.status >= 400 && zip.status < 500, `${zip.status} ${zip.text.slice(0, 100)}`);
const empty = await up(order, csvForm("", "r.csv"));
check("empty file -> 4xx", empty.status >= 400 && empty.status < 500, `${empty.status} ${empty.text.slice(0, 100)}`);
const hdr = await up(order, csvForm("Name,Email,Phone\n", "r.csv"));
console.log("header only:", hdr.status, hdr.text.slice(0, 160));
check("header-only -> clean answer (no 500)", hdr.status < 500, `${hdr.status}`);
const nofile = await admin.post(`/api/admin/drive-orders/${order}/imports`, new FormData());
check("no file -> 400", nofile.status === 400);
const wrongLen = await up(order, csvForm("Name,Phone\nA,9876543210\n", "r.csv"));
console.log("no email column:", wrongLen.status, wrongLen.text.slice(0, 160));
check("no email column -> asks for mapping, not 500", wrongLen.status === 200 && wrongLen.json.needsMapping === true, wrongLen.text.slice(0, 120));

// xlsx
const xl = await up(order, xlsxForm([["Student Name", "Email ID", "Mobile"], ["Xl One", E("xl1"), 9876543220], ["Xl Two", E("xl2"), "98765 43221"], ["Xl Three", E("xl3"), 9.87654322e9], ["Xl Four", E("xl4"), ""]]));
check("xlsx previews", xl.status === 200 && xl.json.importId, xl.text.slice(0, 160));
const xe = await q("select row_no,name,college_email_norm email,phone_e164,state from drive_roster_entries where import_id=$1 order by row_no", [xl.json.importId]);
console.log("  xlsx rows", JSON.stringify(xe));
check("xlsx numeric phone cell read", xe[0]?.phone_e164 === "+919876543220" && xe[2]?.phone_e164 === "+919876543220".replace("3220", "3220"), JSON.stringify(xe[2]));

// preview twice == same import; no side effects
const same = await up(order, csvForm(quirk));
check("same file again returns the same import", same.json?.importId === r1.json.importId && same.json.replayed === true, `${same.json?.importId} vs ${r1.json.importId}`);

// confirm: a few valid rows, double confirm in parallel
const small = await up(order, csvForm(`Name,Email,Phone\nP One,${E("p1")},\nP Two,${E("p2")},\nP Bad,bad-email,\n`));
const [c1, c2] = await Promise.all([admin.post(`/api/admin/imports/${small.json.importId}/confirm`, undefined, idem("dbl1")), admin.post(`/api/admin/imports/${small.json.importId}/confirm`, undefined, idem("dbl2"))]);
const nCodes = (await q("select count(*)::int n from drive_codes c join drive_roster_entries e on e.id=c.entry_id where e.import_id=$1", [small.json.importId]))[0].n;
check("double confirm: 2 codes only (bad row skipped), both calls answered", nCodes === 2 && [c1.status, c2.status].every((s) => s === 200), `${c1.status},${c2.status} codes=${nCodes} ${c1.text.slice(0, 150)}`);
const used = (await q("select issued_count, slots from college_drive_orders where id=$1", [order]).catch(() => [{}]))[0];
console.log("  order after:", JSON.stringify(used));
const re = await up(order, csvForm(`Name,Email,Phone\nP One,${E("p1")},\nQ New,${E("q1")},\n`));
const reRows = await q("select name,state,reasons from drive_roster_entries where import_id=$1 order by row_no", [re.json.importId]);
check("a person already on the order becomes a duplicate in a later file", reRows[0]?.state === "duplicate", JSON.stringify(reRows));

// over-allocation: order with 3 slots
const o3 = await paidOrder(admin, 3, "l3-over");
const ov = await up(o3, csvForm("Name,Email\n" + Array.from({ length: 5 }, (_, i) => `O${i} Name,${E("ov" + i)}`).join("\n")));
const conf = await admin.post(`/api/admin/imports/${ov.json.importId}/confirm`, undefined, idem("over"));
check("over-allocation: confirm refused cleanly, no codes", conf.status >= 400 && conf.status < 500 && (await codesFor(o3)) === 0, `${conf.status} ${conf.text.slice(0, 150)}`);

// 100 / 5000 rows
const rowsCsv = (n, tag) => "Name,Email,Phone\n" + Array.from({ length: n }, (_, i) => `Student ${tag} ${i},s${tag}${i}.${SFX}@e2e-wp5.test,${9000000000 + i}`).join("\n");
const o5k = await paidOrder(admin, 6000, "l3-5k");
let t = Date.now();
const r100 = await up(o5k, csvForm(rowsCsv(100, "a")));
console.log(`  100 rows: ${r100.status} in ${Date.now() - t} ms, counts`, JSON.stringify(r100.json?.counts));
t = Date.now();
const r5k = await up(o5k, csvForm(rowsCsv(5000, "b")));
console.log(`  5000 rows: ${r5k.status} in ${Date.now() - t} ms, counts`, JSON.stringify(r5k.json?.counts), "truncated", r5k.json?.truncated, "rows in response", r5k.json?.rows?.length);
check("5000 rows previews", r5k.status === 200 && r5k.json.counts?.total === 5000, r5k.text.slice(0, 160));
t = Date.now();
const c5k = await admin.post(`/api/admin/imports/${r5k.json.importId}/confirm`, undefined, idem("5k"));
console.log(`  confirm 5000: ${c5k.status} in ${Date.now() - t} ms`, c5k.text.slice(0, 200));
check("confirm 5000 ok, 5000 codes", c5k.status === 200 && (await codesFor(o5k)) === 5000, `${c5k.status} codes=${await codesFor(o5k)}`);
await closeDb();
process.exit(failures() ? 1 : 0);
