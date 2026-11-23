// WP5 L3: TPO roster API: size, rows, duplicates, idempotency, unicode, scope.
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, BASE } from "./wp5-lib.mjs";
const tpo = await login("tpo", "tpo@jklu.edu.in");
const D = (n) => `${n}.${SFX}@e2e-wp5.test`;
const cnt = async () => Number((await q("select count(*)::int n from college_roster where college_id=$1", [JKLU]))[0].n);
const memCount = async () => Number((await q("select count(*)::int n from college_memberships")) [0].n);
const usersCount = async () => Number((await q("select count(*)::int n from users"))[0].n);
const before = { roster: await cnt(), mem: await memCount(), users: await usersCount() };
const mk = (n, tag) => "Name,Email,Phone,Roll No,Year,Branch\n" + Array.from({ length: n }, (_, i) => `Student ${i},${tag}${i}.${SFX}@e2e-wp5.test,${9100000000 + i},R${i},${(i % 4) + 1},CSE`).join("\n");
let t = Date.now();
const r100 = await tpo.post("/api/college/roster", { csv: mk(100, "a") });
check("100 rows", r100.status === 200 && r100.json.imported === 100, `${r100.status} ${r100.text.slice(0, 100)} ${Date.now() - t}ms`);
t = Date.now();
const csv5k = mk(5000, "b");
const r5k = await tpo.post("/api/college/roster", { csv: csv5k });
check("5000 rows", r5k.status === 200 && r5k.json.imported === 5000, `${r5k.status} ${r5k.text.slice(0, 100)} ${Date.now() - t}ms, ${csv5k.length} chars`);
check("roster has +5100", (await cnt()) === before.roster + 5100);
const again = await tpo.post("/api/college/roster", { csv: csv5k });
check("same file again: idempotent, no new rows", again.status === 200 && (await cnt()) === before.roster + 5100, again.text.slice(0, 100));
check("upload created no users, no memberships", (await memCount()) === before.mem && (await usersCount()) === before.users);
const big = await tpo.post("/api/college/roster", { csv: "Name,Email\n" + "x".repeat(2_000_001) });
check("over 2,000,000 chars -> 400", big.status === 400, `${big.status} ${big.text.slice(0, 100)}`);
const bigRows = Array.from({ length: 30000 }, (_, i) => `N${i},c${i}.${SFX}@e2e-wp5.test`).join("\n");
const r30k = await tpo.post("/api/college/roster", { csv: "Name,Email\n" + bigRows });
console.log("30000 rows:", r30k.status, r30k.text.slice(0, 120), `${("Name,Email\n" + bigRows).length} chars`);
const hdr = await tpo.post("/api/college/roster", { csv: "Name,Email\n" });
check("header only -> 400", hdr.status === 400, hdr.text);
const dup = await tpo.post("/api/college/roster", { csv: `Name,Email,Phone\nA One,${D("d1")},9100000001\nB Two,${D("D1")},9100000002\nC Three,${D("d3")},9100000001\n,${D("blankname")},\nZed,not-an-email,\n` });
check("dup email kept-first + reported; dup phone allowed; blank name allowed; bad email reported", dup.json?.imported === 3 && dup.json.errors.length === 2, dup.text);
const rowD1 = (await q("select name,phone from college_roster where college_id=$1 and email=$2", [JKLU, D("d1")]))[0];
check("first duplicate won", rowD1?.name === "A One");
// a re-upload with a changed name/year overwrites, phone-less upload keeps the phone
await tpo.post("/api/college/roster", { csv: `Name,Email\nA Renamed,${D("d1")}` });
const rowD1b = (await q("select name,phone from college_roster where college_id=$1 and email=$2", [JKLU, D("d1")]))[0];
check("re-upload updates name, keeps phone when the sheet has none", rowD1b.name === "A Renamed" && rowD1b.phone === "9100000001", JSON.stringify(rowD1b));
const uni = await tpo.post("/api/college/roster", { csv: `नाम,Email\nराहुल शर्मा,${D("hindi")}\n` });
console.log("devanagari header:", uni.status, uni.text.slice(0, 100));
const uni2 = await tpo.post("/api/college/roster", { csv: `Name,Email\nराहुल शर्मा 😀,${D("hindi")}\n` });
check("devanagari + emoji name stored", uni2.status === 200 && (await q("select name from college_roster where email=$1", [D("hindi")]))[0].name === "राहुल शर्मा 😀");
// formula payloads stay data; shown escaped
const fx = await tpo.post("/api/college/roster", { csv: `Name,Email\n"=HYPERLINK(""http://evil.test"",""x"")",${D("fx")}\n` });
check("formula name stored as text", fx.status === 200 && (await q("select name from college_roster where email=$1", [D("fx")]))[0].name.startsWith("=HYPERLINK"));
// no body / wrong shape
check("no csv -> 400", (await tpo.post("/api/college/roster", {})).status === 400);
// other college is untouched: rows only in JKLU
check("rows land in this college only", Number((await q("select count(*)::int n from college_roster where email=$1 and college_id<>$2", [D("d1"), JKLU]))[0].n) === 0);
// remove
const rm = await tpo.del("/api/college/roster", { emails: [D("d1"), D("fx")] });
check("remove 2 roster rows", rm.json?.removed === 2, rm.text);
await closeDb();
process.exit(failures() ? 1 : 0);
