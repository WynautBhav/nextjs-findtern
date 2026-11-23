// WP5 L4: nudges: recipients, cooldown, parallel double-click, students outside the college's view.
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, POORNIMA, mailLog, sleep } from "./wp5-lib.mjs";
const tpo = await login("tpo", "tpo@jklu.edu.in");
const mk = (f, l, dom = "jklu.edu.in") => mkUser({ first: f, last: l, email: `${f}.${l}.${SFX}@${dom}`.toLowerCase() });
const A = await mk("Nora", "Nudge"), B = await mk("Omar", "Nudge"), L = await mk("Lena", "Left"), X = await mk("Xena", "Other", "gmail.com");
await tpo.post("/api/college/students/decide", { userIds: [A.id, B.id, L.id], action: "accept" });
await q("insert into college_memberships (user_id,college_id,status,verified_by) values ($1,$2,'verified','college_code')", [X.id, POORNIMA]);
const rq = (await q("insert into college_leave_requests (user_id,college_id,status) values ($1,$2,'requested') returning id", [L.id, JKLU]).catch(() => null));
const sl = await login("student", L.email);
await sl.post("/api/intern/college/leave-request", { reason: "bye" });
const lid = (await q("select id from college_leave_requests where user_id=$1 and status='requested'", [L.id]))[0].id;
await tpo.post("/api/college/leave-requests/decide", { ids: [lid], action: "approve" });
const nm = (id) => q("select count(*)::int n from notifications where recipient_id=$1 and type like 'college_nudge_%'", [id]).then((r) => r[0].n);
const mails = (since, to) => mailLog().slice(since).split("--- ").filter((b) => /^20\d\d-/.test(b) && new RegExp(`^To: ${to.replace(/[.+]/g, "\\$&")}$`, "m").test(b)).length;

let m0 = mailLog().length;
const r1 = await tpo.post("/api/college/nudge", { kind: "online", userIds: [A.id, L.id, X.id, "nope"] });
check("nudge: only A is sent; left/other-college/unknown skipped", r1.json?.sent === 1 && r1.json.skipped === 3, r1.text);
await sleep(300);
check("A got 1 bell + 1 mail", (await nm(A.id)) === 1 && mails(m0, A.email) === 1);
check("L (left) and X (other college) got nothing", (await nm(L.id)) === 0 && (await nm(X.id)) === 0 && mails(m0, L.email) === 0 && mails(m0, X.email) === 0);
const r2 = await tpo.post("/api/college/nudge", { kind: "online", userIds: [A.id] });
check("repeat inside 10 min -> skipped, no 2nd mail", r2.json?.sent === 0 && r2.json.skipped === 1 && mails(m0, A.email) === 1, r2.text);
m0 = mailLog().length;
const par = await Promise.all([1, 2, 3].map(() => tpo.post("/api/college/nudge", { kind: "online", userIds: [B.id] })));
await sleep(500);
const sent = par.reduce((a, r) => a + (r.json?.sent ?? 0), 0);
check("3 parallel nudges of the same kind -> exactly 1 sent", sent === 1 && mails(m0, B.email) === 1 && (await nm(B.id)) === 1, `sent=${sent} mails=${mails(m0, B.email)} bells=${await nm(B.id)} rows=${(await q("select count(*)::int n from college_nudges where user_id=$1", [B.id]))[0].n}`);
const r4 = await tpo.post("/api/college/nudge", { kind: "bogus", userIds: [A.id] });
check("bad kind 400", r4.status === 400);
const big = await tpo.post("/api/college/nudge", { kind: "meeting", userIds: Array.from({ length: 1001 }, (_, i) => `u${i}`) });
check("1001 ids 400", big.status === 400);
const msg = (await q("select title,message from notifications where recipient_id=$1 and type='college_nudge_online'", [A.id]))[0];
console.log(JSON.stringify(msg));
// kind=offer to someone with no offer
const r5 = await tpo.post("/api/college/nudge", { kind: "offer", userIds: [A.id] });
console.log("offer nudge to student with no offer:", r5.text);
await closeDb();
process.exit(failures() ? 1 : 0);
