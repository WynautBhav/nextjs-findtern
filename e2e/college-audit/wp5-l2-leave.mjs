// WP5 L2: leave requests end to end.
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, POORNIMA, mailLog, sleep } from "./wp5-lib.mjs";
const tpo = await login("tpo", "tpo@jklu.edu.in");
const admin = await login("admin", "admin@findtern.dev");
const mk = async (n, last) => {
  const u = await mkUser({ first: n, last, email: `${n.toLowerCase()}.${last.toLowerCase()}.${SFX}@jklu.edu.in` });
  return u;
};
const s1 = await mk("Leo", "One"), s2 = await mk("Mia", "Two"), s3 = await mk("Nik", "Three");
const acc = await tpo.post("/api/college/students/decide", { userIds: [s1.id, s2.id, s3.id], action: "accept" });
check("accept 3 college-email students", acc.json?.done === 3, acc.text);
const tile = async () => {
  const t = (await tpo.get("/college")).text;
  return t;
};
const countMem = async () => Number((await q("select count(*)::int n from college_memberships where college_id=$1 and left_at is null", [JKLU]))[0].n);
const before = await countMem();
const c1 = await login("student", s1.email), c2 = await login("student", s2.email), c3 = await login("student", s3.email);

// student request with a hostile reason
const mailBefore = mailLog().length;
const hostile = `<script>alert(1)</script> "quoted" & é 😀`;
const r1 = await c1.post("/api/intern/college/leave-request", { reason: hostile });
check("s1 request with reason", r1.status === 200 && r1.json.college.leaveRequest.status === "requested", r1.text.slice(0, 100));
const dup = await c1.post("/api/intern/college/leave-request", { reason: "again" });
check("second request refused (409 already_requested)", dup.status === 409 && dup.json.code === "already_requested", dup.text);
const par = await Promise.all([c2.post("/api/intern/college/leave-request", {}), c2.post("/api/intern/college/leave-request", {})]);
check("two parallel requests -> one row", (await q("select count(*)::int n from college_leave_requests where user_id=$1", [s2.id]))[0].n === 1, par.map((p) => p.status).join(","));
const long = await c3.post("/api/intern/college/leave-request", { reason: "x".repeat(501) });
check("reason > 500 refused", long.status === 400, long.text);
const unk = await c3.post("/api/intern/college/leave-request", { reason: "ok", college: POORNIMA });
check("extra key refused", unk.status === 400, unk.text);
// cancel + re-request
const cancel = await c2.del("/api/intern/college/leave-request");
check("cancel own request", cancel.status === 200 && cancel.json.college.leaveRequest.status === "cancelled", cancel.text.slice(0, 100));
const nocancel = await c2.del("/api/intern/college/leave-request");
check("cancel again -> 404", nocancel.status === 404, nocancel.text);
const re = await c2.post("/api/intern/college/leave-request", { reason: "  " });
check("request again after cancel (blank reason => none)", re.status === 200, re.text.slice(0, 80));
const rowS2 = (await q("select reason from college_leave_requests where user_id=$1 and status='requested'", [s2.id]))[0];
check("blank reason stored as null", rowS2?.reason === null);
// officer email
await sleep(300);
const log = mailLog().slice(mailBefore);
const officerMails = log.split("--- ").filter((b) => /^20\d\d-/.test(b) && /asked to leave/.test(b));
console.log("officer mails:", officerMails.length, "recipients:", officerMails.map((b) => b.match(/^To: (.*)$/m)?.[1]).join(" | "));
check("only the college's officer was mailed (3 requests -> 3 mails, to tpo only)", officerMails.every((b) => /^To: tpo@jklu.edu.in$/m.test(b)), "");
const m1 = officerMails.find((b) => /Leo One/.test(b));
check("officer mail carries the reason as plain text (HTML escaping is covered by src/lib/emails.test.ts)", !!m1 && m1.includes("Reason: <script>alert(1)</script>"), "")
console.log((m1 ?? "").slice(0, 400));

// TPO list
const list = await tpo.get("/api/college/leave-requests");
check("TPO sees 2 pending (s1,s2)", list.json.pending >= 2 && list.json.requests.some((r) => r.userId === s1.id), `pending=${list.json.pending}`);
// reject with note
const ids = Object.fromEntries((await q("select user_id,id from college_leave_requests where status='requested' and user_id = any($1)", [[s1.id, s2.id]])).map((r) => [r.user_id, r.id]));
const rej = await tpo.post("/api/college/leave-requests/decide", { ids: [ids[s1.id]], action: "reject", note: "Finish your drive first" });
check("reject with note", rej.status === 200 && rej.json.rejected === 1, rej.text);
const nt = (await q("select title,message from notifications where recipient_id=$1 and type='college_leave_decided'", [s1.id]));
check("student told, with note, no secrets", nt.length === 1 && /Finish your drive first/.test(nt[0].message), JSON.stringify(nt));
const rej2 = await tpo.post("/api/college/leave-requests/decide", { ids: [ids[s1.id]], action: "reject", note: "again" });
check("reject twice idempotent -> already", rej2.json.results[0].already === true && (await q("select count(*)::int n from college_audit_log where action='leave_request.rejected' and subject_user_id=$1", [s1.id]))[0].n === 1, rej2.text);
const conflict = await tpo.post("/api/college/leave-requests/decide", { ids: [ids[s1.id]], action: "approve" });
check("approve after reject -> 409 already_decided", conflict.json.results[0].code === "already_decided", conflict.text);
check("s1 still member after reject", (await q("select left_at from college_memberships where user_id=$1", [s1.id]))[0].left_at === null);
// s1 asks again, double-click approve in parallel
const re1 = await c1.post("/api/intern/college/leave-request", { reason: "please" });
check("re-request after reject allowed", re1.status === 200);
const id1 = (await q("select id from college_leave_requests where user_id=$1 and status='requested'", [s1.id]))[0].id;
const dbl = await Promise.all([tpo.post("/api/college/leave-requests/decide", { ids: [id1], action: "approve" }), tpo.post("/api/college/leave-requests/decide", { ids: [id1], action: "approve" })]);
await sleep(300);
const aud = (await q("select count(*)::int n from college_audit_log where action='leave_request.approved' and subject_user_id=$1", [s1.id]))[0].n;
const nots = (await q("select count(*)::int n from notifications where recipient_id=$1 and type='college_leave_decided' and title like 'You left%'", [s1.id]))[0].n;
check("double-click approve -> 1 audit row, 1 notification", aud === 1 && nots === 1, `audit=${aud} notif=${nots} statuses=${JSON.stringify(dbl.map((d) => d.json?.results?.[0]))}`);
check("s1 left; account type individual", (await q("select left_at from college_memberships where user_id=$1", [s1.id]))[0].left_at !== null);
check("member count dropped by exactly 1", (await countMem()) === before - 1, `${before} -> ${await countMem()}`);
// leaver cannot request again
const rl = await c1.post("/api/intern/college/leave-request", { reason: "x" });
check("left student cannot request (not_member)", rl.status === 409 && rl.json.code === "not_member", rl.text);
// visibility: s1 gone from TPO students list / master data / export
const idx = (await tpo.get("/college/students")).text;
check("s1 not in TPO students page", !idx.includes("Leo One"));
// admin path idempotent
const ad1 = await admin.post(`/api/admin/colleges/${JKLU}/leave-requests`, { email: s3.email, action: "end", note: "ended by admin" });
const ad2 = await admin.post(`/api/admin/colleges/${JKLU}/leave-requests`, { email: s3.email, action: "end" });
check("admin end by email once, then 404", ad1.status === 200 && ad2.status === 404, `${ad1.status} ${ad2.status} ${ad2.text}`);
const nt3 = await q("select title,message from notifications where recipient_id=$1 and type='college_leave_decided'", [s3.id]);
check("s3 notified once of the leave", nt3.length === 1, JSON.stringify(nt3));
// admin approve s2's pending request, twice
const id2 = (await q("select id from college_leave_requests where user_id=$1 and status='requested'", [s2.id]))[0].id;
const a1 = await admin.post(`/api/admin/colleges/${JKLU}/leave-requests`, { requestId: id2, action: "approve" });
const a2 = await admin.post(`/api/admin/colleges/${JKLU}/leave-requests`, { requestId: id2, action: "approve" });
check("admin approve idempotent", a1.json?.already === false && a2.json?.already === true, `${a1.text} ${a2.text}`);
// cross-college: Poornima officer? use admin with wrong college id
const wrongCollege = await admin.post(`/api/admin/colleges/${POORNIMA}/leave-requests`, { requestId: id2, action: "approve" });
check("admin deciding via another college id -> 404", wrongCollege.status === 404, wrongCollege.text);
// bulk 100 / 101
const b101 = await tpo.post("/api/college/leave-requests/decide", { ids: Array.from({ length: 101 }, (_, i) => `x${i}`), action: "approve" });
check("bulk 101 refused", b101.status === 400, b101.text.slice(0, 80));
const b100 = await tpo.post("/api/college/leave-requests/decide", { ids: Array.from({ length: 100 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`), action: "approve" });
check("bulk 100 unknown ids -> 100 failures, no crash", b100.status === 200 && b100.json.failed === 100, `${b100.status} ${b100.text.slice(0, 120)}`);
console.log("failures:", failures());
console.log(JSON.stringify({ s1: s1.id, s2: s2.id, s3: s3.id }));
await closeDb();
process.exit(failures() ? 1 : 0);
