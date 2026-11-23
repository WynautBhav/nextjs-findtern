// WP5 L4: confirm announcement + campaign + outbox drain + resend: who gets which mail.
import { login, q, mkUser, check, failures, closeDb, SFX, paidOrder, uploadConfirm, codeOfRow, mailLog, sleep } from "./wp5-lib.mjs";

const tpo = await login("tpo", "tpo@jklu.edu.in");
const admin = await login("admin", "admin@findtern.dev");
const D = (n) => `${n.toLowerCase()}.${SFX}@e2e-wp5.test`;
const POORNIMA = "692f279c-e4d2-4ffd-a3a1-3f21624dcf87";
const S1 = await mkUser({ first: "Sam", last: "Matched", email: D("sam") }); // matched, unpaid
const PAID = (await q("select u.id,u.email,u.first_name,u.last_name from users u join intern_payments p on p.intern_id=u.id and p.status='paid' join college_memberships m on m.user_id=u.id and m.left_at is null limit 1"))[0]; // activated seeded member
const DEN = await mkUser({ first: "Dan", last: "Denied", email: D("dan") });
const OTHER = await mkUser({ first: "Olga", last: "Other", email: D("olga") });
await q("insert into college_memberships (user_id,college_id,status,verified_by) values ($1,$2,'verified','college_code')", [OTHER.id, POORNIMA]);
await tpo.post("/api/college/roster", { csv: `Name,Email\nDan Denied,${DEN.email}` });
await tpo.post("/api/college/students/decide", { userIds: [DEN.id], action: "deny" });
const m0 = mailLog().length;
const orderId = await paidOrder(admin, 20, "camp");
const csv = `Name,Email,Phone\nSam Matched,${S1.email},\n${PAID.first_name} ${PAID.last_name},${PAID.email},\nDan Denied,${DEN.email},\nOlga Other,${OTHER.email},\nUn One,${D("un1")},\nUn Two,${D("un2")},`;
const { importId, conf } = await uploadConfirm(admin, orderId, csv, "camp");
console.log("confirm", JSON.stringify(conf.result));
await sleep(1500);
const CODE = /[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}/;
const by = (to, since = m0) => mailLog().slice(since).split("--- ").filter((b) => /^20\d\d-/.test(b) && b.includes(`To: ${to}\n`));
const subj = (b) => b.match(/^Subject: (.*)$/m)?.[1];
const who = [["S1", S1.email], ["PAID", PAID.email], ["DEN", DEN.email], ["OTHER", OTHER.email], ["un1", D("un1")], ["un2", D("un2")]];
const report = (label) => { for (const [n, e] of who) console.log(label, n, JSON.stringify(by(e).map(subj))); };
report("after confirm:");
check("matched unpaid S1: one mail, no code", by(S1.email).length === 1 && !CODE.test(by(S1.email)[0]));
check("denied student gets no 'college paid your fee' mail", by(DEN.email).length === 0, JSON.stringify(by(DEN.email).map(subj)));
check("already-activated member gets no 'accept your fee' mail", by(PAID.email).length === 0, JSON.stringify(by(PAID.email).map(subj)));
check("student in another college gets no 'accept your fee' mail", by(OTHER.email).length === 0, JSON.stringify(by(OTHER.email).map(subj)));
const camp = await admin.post(`/api/admin/drive-orders/${orderId}/campaign`);
console.log("campaign", camp.text);
await sleep(2500);
report("after campaign:");
const camp2 = await admin.post(`/api/admin/drive-orders/${orderId}/campaign`);
check("campaign repeat queues 0", camp2.json?.queued === 0, camp2.text);
const tick = await fetch(process.env.BASE + "/api/cron/email-outbox", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
console.log("tick", tick.status, await tick.text());
await sleep(500);
for (const [n, e] of [["un1", D("un1")], ["un2", D("un2")]]) check(`${n} got exactly one code mail`, by(e).filter((b) => CODE.test(b)).length === 1, JSON.stringify(by(e).map(subj)));
const un1c = await codeOfRow(importId, 5);
const un2c = await codeOfRow(importId, 6);
check("mail to un1 carries un1's own code, not un2's", by(D("un1")).some((b) => b.includes(un1c)) && !by(D("un1")).some((b) => b.includes(un2c)), un1c);
// S1 (matched, unpaid, can still use the code) may get the code mail when the admin presses Send: by design, the code is bound to them.
for (const [n, e] of [["PAID", PAID.email], ["DEN", DEN.email], ["OTHER", OTHER.email]]) {
  check(`campaign sent no code to ${n} (denied/other-college/activated)`, by(e).filter((b) => CODE.test(b)).length === 0, `${by(e).filter((b) => CODE.test(b)).length} code mails`);
}
console.log("outbox", JSON.stringify(await q("select ob.to_email, ob.status from email_outbox ob join email_campaigns c on c.id::text=ob.campaign_id where c.order_id=$1 order by ob.created_at", [orderId])));
const row = (await q("select ob.id from email_outbox ob join email_campaigns c on c.id::text=ob.campaign_id where c.order_id=$1 and ob.to_email=$2", [orderId, D("un1")]))[0];
const mR = mailLog().length;
const rs1 = await Promise.all([admin.post(`/api/admin/drive-orders/${orderId}/outbox/${row.id}/resend`), admin.post(`/api/admin/drive-orders/${orderId}/outbox/${row.id}/resend`)]);
await sleep(2500);
check("parallel resend: one accepted, one refused", rs1.filter((r) => r.status === 200).length === 1 && rs1.filter((r) => r.status === 409).length === 1, rs1.map((r) => r.status).join(","));
check("resend produced exactly 1 more mail", by(D("un1"), mR).length === 1, String(by(D("un1"), mR).length));
console.log(JSON.stringify({ orderId, importId }));
await closeDb();
process.exit(failures() ? 1 : 0);
