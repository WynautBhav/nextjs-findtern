// WP5 L2: a student whose leave was approved must not be put back by a later drive-sheet confirm (verifyMembership in admin-db.ts).
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, paidOrder, uploadConfirm } from "./wp5-lib.mjs";
const tpo = await login("tpo", "tpo@jklu.edu.in");
const admin = await login("admin", "admin@findtern.dev");
const S = await mkUser({ first: "Sona", last: "Leaver", email: `sona.${SFX}@jklu.edu.in` });
check("accept", (await tpo.post("/api/college/students/decide", { userIds: [S.id], action: "accept" })).status === 200);
const st = await login("student", S.email);
check("request leave", (await st.post("/api/intern/college/leave-request", { reason: "transferring" })).status === 200);
const rid = (await q("select id from college_leave_requests where user_id=$1", [S.id]))[0].id;
check("approve", (await tpo.post("/api/college/leave-requests/decide", { ids: [rid], action: "approve" })).json?.approved === 1);
const left = async () => (await q("select left_at, status, verified_by from college_memberships where user_id=$1", [S.id]))[0];
check("S has left", (await left()).left_at !== null);
const orderId = await paidOrder(admin, 5, "l2b");
await uploadConfirm(admin, orderId, `Name,Email,Phone\nSona Leaver,${S.email},`, "l2b");
const after = await left();
check("a drive-sheet confirm does not silently re-add a student who left", after.left_at !== null, JSON.stringify(after));
await closeDb();
process.exit(failures() ? 1 : 0);
