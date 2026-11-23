// WP5 R1/L1: double-submit approvals; student on employer join; real PNG bytes; xlsx bomb.
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, paidOrder, csvForm } from "./wp5-lib.mjs";
import { deflateRawSync } from "node:zlib";
import { crc32 } from "../../src/lib/xlsx.ts";
const tpo = await login("tpo", "tpo@jklu.edu.in");
const admin = await login("admin", "admin@findtern.dev");
const a = await mkUser({ first: "Race", last: "Accept", email: `race.${SFX}@jklu.edu.in` });
const dec = (ids, action) => tpo.post("/api/college/students/decide", { userIds: ids, action });
const nn = (id, t) => q("select count(*)::int n from notifications where recipient_id=$1 and type='college_membership_decided' and title like $2", [id, t]).then((r) => r[0].n);
await Promise.all([dec([a.id], "accept"), dec([a.id], "accept")]);
check("parallel accept: 1 notification, 1 audit row", (await nn(a.id, "% added you to%")) === 1 && (await q("select count(*)::int n from college_audit_log where subject_user_id=$1 and action like '%accept%'", [a.id]))[0].n === 1, `n=${await nn(a.id, "% added you to%")}`);
await Promise.all([dec([a.id], "deny"), dec([a.id], "deny")]);
check("parallel deny: 1 notification", (await nn(a.id, "% removed you%")) === 1, `n=${await nn(a.id, "% removed you%")}`);
await Promise.all([dec([a.id], "restore"), dec([a.id], "restore")]);
check("parallel restore: 1 notification, member again", (await nn(a.id, "% added you back")) === 1 && (await q("select left_at from college_memberships where user_id=$1", [a.id]))[0].left_at === null);
const big = await dec(Array.from({ length: 501 }, (_, i) => `x${i}`), "accept");
console.log("501 ids:", big.status, big.text.slice(0, 100));
// students and /api/drives/join (employer only)
const st = await login("student", a.email);
const j = await st.post("/api/drives/join", { token: "x".repeat(40) });
check("student on /api/drives/join -> 403", j.status === 403, `${j.status} ${j.text.slice(0, 80)}`);
// real PNG bytes named .csv
const order = await paidOrder(admin, 5, "l1d");
const f = new FormData(); f.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])], "r.csv", { type: "text/csv" }));
const png = await admin.post(`/api/admin/drive-orders/${order}/imports`, f);
check("real PNG bytes named .csv -> 415", png.status === 415, `${png.status}`);
const f2 = new FormData(); f2.set("file", new File([new Uint8Array([0xff, 0xfe, 0x4e, 0x00, 0x61, 0x00])], "r.csv", { type: "text/csv" }));
const u16 = await admin.post(`/api/admin/drive-orders/${order}/imports`, f2);
console.log("UTF-16 BOM csv ->", u16.status, u16.text.slice(0, 100));
// xlsx bomb: a 60 MB sheet inside a 60 KB zip
function zip(entries) {
  const parts = []; const cd = []; let off = 0;
  for (const [name, data] of entries) {
    const raw = Buffer.from(data); const def = deflateRawSync(raw); const nm = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(def.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, def);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(def.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    cd.push(ch, nm); off += 30 + nm.length + def.length;
  }
  const cdb = Buffer.concat(cd); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, end]);
}
const sheet = `<?xml version="1.0"?><worksheet><sheetData>${"<row><c t=\"inlineStr\"><is><t>a</t></is></c></row>".repeat(1800000)}</sheetData></worksheet>`;
const bomb = zip([["[Content_Types].xml", "<Types/>"], ["xl/worksheets/sheet1.xml", sheet]]);
console.log("bomb zip bytes", bomb.length, "inflated", sheet.length);
const f3 = new FormData(); f3.set("file", new File([bomb], "bomb.xlsx"));
const t = Date.now(); const bm = await admin.post(`/api/admin/drive-orders/${order}/imports`, f3);
check("xlsx bomb refused cleanly and quickly", bm.status >= 400 && bm.status < 500 && Date.now() - t < 10000, `${bm.status} ${bm.text.slice(0, 100)} ${Date.now() - t}ms`);
check("server still answers", (await admin.get("/api/auth/me")).status < 500);
await closeDb();
process.exit(failures() ? 1 : 0);
