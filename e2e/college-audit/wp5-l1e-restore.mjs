// WP5 L1: "add back" (restore): who can be restored, who cannot.
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, POORNIMA, POORNIMA_CODE, JKLU_CODE } from "./wp5-lib.mjs";
await q("update colleges set is_partner=true, is_active=true where id=$1", [POORNIMA]);
const tpo = await login("tpo", "tpo@jklu.edu.in");
const dec = (ids, action) => tpo.post("/api/college/students/decide", { userIds: ids, action });
const mem = async (u) => (await q("select college_id,status,left_at from college_memberships where user_id=$1", [u.id]))[0];
const E = await mkUser({ first: "Eve", last: "Never", email: `eve.never.${SFX}@gmail.com` });
const L = await mkUser({ first: "Lou", last: "Left", email: `lou.${SFX}@jklu.edu.in` });
const M = await mkUser({ first: "Max", last: "Moved", email: `max.${SFX}@jklu.edu.in` });
const rE = await dec([E.id], "restore");
check("restore of a stranger who was never in the college -> 404", rE.status === 404, rE.text);
await dec([L.id, M.id], "accept");
const sL = await login("student", L.email);
await sL.post("/api/intern/college/leave-request", { reason: "x" });
const rid = (await q("select id from college_leave_requests where user_id=$1", [L.id]))[0].id;
await tpo.post("/api/college/leave-requests/decide", { ids: [rid], action: "approve" });
const rl = await dec([L.id], "restore");
console.log("restore of a student who left by approved leave:", rl.status, rl.text, JSON.stringify(await mem(L)));
// M leaves and joins Poornima by code, then JKLU tries restore
const sM = await login("student", M.email);
await sM.post("/api/intern/college/leave-request", { reason: "x" });
const rid2 = (await q("select id from college_leave_requests where user_id=$1", [M.id]))[0].id;
await tpo.post("/api/college/leave-requests/decide", { ids: [rid2], action: "approve" });
const j = await sM.post("/api/intern/college", { code: POORNIMA_CODE, year: 2, branch: "CSE", declaredAdult: true });
check("M joins Poornima after leaving JKLU", j.status === 200, j.text.slice(0, 100));
const rm = await dec([M.id], "restore");
console.log("JKLU restore of a student now in Poornima:", rm.status, rm.text, JSON.stringify(await mem(M)));
check("restore never pulls a student out of another college", (await mem(M)).college_id === POORNIMA, JSON.stringify(await mem(M)));
// deny someone who is in ANOTHER college: must not touch their membership
const dn = await dec([M.id], "deny");
console.log("JKLU deny of a Poornima member:", dn.status, dn.text, JSON.stringify(await mem(M)));
check("deny does not end a Poornima membership", (await mem(M)).college_id === POORNIMA && (await mem(M)).left_at === null);
await closeDb();
process.exit(failures() ? 1 : 0);
