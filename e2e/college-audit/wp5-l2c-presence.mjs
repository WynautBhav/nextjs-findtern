// WP5 L2: leaving removes the student from live presence / the officer's live count at once.
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU } from "./wp5-lib.mjs";
const tpo = await login("tpo", "tpo@jklu.edu.in");
const u = await mkUser({ first: "Pres", last: "Ence", email: `pres.${SFX}@jklu.edu.in` });
await tpo.post("/api/college/students/decide", { userIds: [u.id], action: "accept" });
const st = await login("student", u.email);
const hb = await st.post("/api/intern/college/heartbeat", {});
check("heartbeat while a member records presence", hb.status === 200 && hb.json.college === JKLU && (await q("select count(*)::int n from college_presence where user_id=$1", [u.id]))[0].n === 1, hb.text.slice(0, 80));
const live = async () => (await tpo.get("/api/college/presence")).json;
const before = await live();
console.log("officer presence api:", JSON.stringify(before).slice(0, 200));
await st.post("/api/intern/college/leave-request", {});
const rid = (await q("select id from college_leave_requests where user_id=$1", [u.id]))[0].id;
await tpo.post("/api/college/leave-requests/decide", { ids: [rid], action: "approve" });
check("presence row removed by the approved leave", (await q("select count(*)::int n from college_presence where user_id=$1", [u.id]))[0].n === 0);
const hb2 = await st.post("/api/intern/college/heartbeat", {});
check("heartbeat after leaving: no college, no new presence", hb2.json.college === null && (await q("select count(*)::int n from college_presence where user_id=$1", [u.id]))[0].n === 0, hb2.text.slice(0, 80));
const after = await live();
console.log("officer presence after:", JSON.stringify(after).slice(0, 200));
// denied student: heartbeat clean
const d = await mkUser({ first: "Den", last: "Ied", email: `den.${SFX}@jklu.edu.in` });
await tpo.post("/api/college/students/decide", { userIds: [d.id], action: "accept" });
const sd = await login("student", d.email);
await sd.post("/api/intern/college/heartbeat", {});
await tpo.post("/api/college/students/decide", { userIds: [d.id], action: "deny" });
check("deny removes presence row too", (await q("select count(*)::int n from college_presence where user_id=$1", [d.id]))[0].n === 0);
await closeDb();
process.exit(failures() ? 1 : 0);
