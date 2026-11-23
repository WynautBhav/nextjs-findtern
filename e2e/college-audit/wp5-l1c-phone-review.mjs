// WP5 L1: phone+name suggestions (identity reviews): confirm / reject / repeat / other college / denied / disabled.
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, POORNIMA, paidOrder, uploadConfirm, mailLog, sleep } from "./wp5-lib.mjs";
const R8 = () => String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
const PN = Object.fromEntries(["p", "q", "r", "t", "u"].map((k) => [k, `97${R8()}`]));
const tpo = await login("tpo", "tpo@jklu.edu.in");
const admin = await login("admin", "admin@findtern.dev");
const D = (n) => `${n}.${SFX}@e2e-wp5.test`;
const P = await mkUser({ first: "Pia", last: "Phone", email: `pia.${SFX}@gmail.com`, phone: PN.p });
const Q = await mkUser({ first: "Quin", last: "Elsewhere", email: `quin.${SFX}@gmail.com`, phone: PN.q });
const R = await mkUser({ first: "Rex", last: "Denied", email: `rex.${SFX}@gmail.com`, phone: PN.r });
const T = await mkUser({ first: "Tia", last: "Off", email: `tia.${SFX}@gmail.com`, phone: PN.t, active: false });
const U = await mkUser({ first: "Uma", last: "Unverified", email: `uma.${SFX}@gmail.com`, phone: PN.u, verified: false });
await q("insert into college_memberships (user_id,college_id,status,verified_by) values ($1,$2,'verified','college_code')", [Q.id, POORNIMA]);
await tpo.post("/api/college/roster", { csv: `Name,Email\nRex Denied,${R.email}` });
await tpo.post("/api/college/students/decide", { userIds: [R.id], action: "deny" });
const orderId = await paidOrder(admin, 20, "l1c");
const csv = `Name,Email,Phone
Pia Phone,${D("pia")},+91 ${PN.p.slice(0, 5)} ${PN.p.slice(5)}
Quin Elsewhere,${D("quin")},${PN.q}
Rex Denied,${D("rex")},0${PN.r}
Tia Off,${D("tia")},${PN.t}
Uma Unverified,${D("uma")},${PN.u}`;
const m0 = mailLog().length;
const { importId, conf } = await uploadConfirm(admin, orderId, csv, "l1c");
console.log("confirm", JSON.stringify(conf.result));
const reviews = await q("select v.id, v.status, v.candidate_intern_id, e.name from identity_reviews v join drive_roster_entries e on e.id=v.entry_id where e.import_id=$1 order by e.row_no", [importId]);
console.log("reviews", reviews.map((r) => `${r.name}:${r.status}`));
const rev = (u) => reviews.find((r) => r.candidate_intern_id === u.id);
const mem = async (u) => (await q("select college_id,status,left_at from college_memberships where user_id=$1", [u.id]))[0];
check("no membership created by the confirm itself for P (suggestion only)", !(await mem(P)));
console.log("review offered for unverified-email student (admin decides, fine):", !!rev(U));
check("a disabled account gets no review (REQUEST WP5-R3: admin-db.ts candidate query has no is_active)", !rev(T), `T=${!!rev(T)}`);
const link = (u) => admin.post(`/api/admin/identity-reviews/${rev(u).id}`, { decision: "link" });
const lp = await link(P);
check("admin links P", lp.status === 200 && lp.json.status === "linked", lp.text);
const mp = await mem(P);
check("P becomes a verified JKLU member only after the admin decision", mp?.college_id === JKLU && mp.status === "verified" && !mp.left_at, JSON.stringify(mp));
const lp2 = await link(P);
check("link twice = replay, no error", lp2.status === 200 && lp2.json.replayed === true, lp2.text);
const lq = await link(Q);
const mq = await mem(Q);
console.log("link Q (member of Poornima):", lq.status, lq.text, JSON.stringify(mq));
check("linking a Poornima member never moves them", mq.college_id === POORNIMA);
const lr = await link(R);
const mr = await mem(R);
console.log("link R (denied by JKLU):", lr.status, lr.text.slice(0, 150), JSON.stringify(mr));
check("linking a student JKLU denied does not make them a member", !(mr && mr.college_id === JKLU && !mr.left_at));
await sleep(500);
const mails = mailLog().slice(m0).split("--- ").filter((b) => /^20\d\d-/.test(b));
console.log("mails after confirm+links:", mails.map((b) => b.match(/^To: (.*)$/m)?.[1] + " | " + b.match(/^Subject: (.*)$/m)?.[1]));
console.log("P notifications:", JSON.stringify(await q("select type,title from notifications where recipient_id=$1", [P.id])));
await closeDb();
process.exit(failures() ? 1 : 0);
