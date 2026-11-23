// WP5 L1 (suspect P2): denied / left student redeems a drive code of the same college.
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, paidOrder, uploadConfirm, codeOfRow, mailLog } from "./wp5-lib.mjs";
const tpo = await login("tpo", "tpo@jklu.edu.in");
const admin = await login("admin", "admin@findtern.dev");
const H = await mkUser({ first: "Hari", last: "Om", email: `hari.${SFX}@gmail.com` });   // will be denied
const L = await mkUser({ first: "Lata", last: "Rao", email: `lata.${SFX}@gmail.com` });  // will leave (approved)
// H: on roster, same name -> candidate -> deny
await tpo.post("/api/college/roster", { csv: `Name,Email\nHari Om,${H.email}\nLata Rao,${L.email}` });
check("accept L", (await tpo.post("/api/college/students/decide", { userIds: [L.id], action: "accept" })).status === 200);
check("deny H", (await tpo.post("/api/college/students/decide", { userIds: [H.id], action: "deny" })).status === 200);
const sL = await login("student", L.email);
const lr = await sL.post("/api/intern/college/leave-request", { reason: "moving" });
check("L files leave request", lr.status === 200, lr.text.slice(0, 120));
const req = (await q("select id from college_leave_requests where user_id=$1", [L.id]))[0];
check("TPO approves L's leave", (await tpo.post("/api/college/leave-requests/decide", { ids: [req.id], action: "approve" })).json?.approved === 1);

const orderId = await paidOrder(admin, 10, "l1b");
const { importId } = await uploadConfirm(admin, orderId, `Name,Email,Phone\nHari Om,${H.email},\nLata Rao,${L.email},\nZed Zee,zed.${SFX}@gmail.com,`, "l1b");
const cH = await codeOfRow(importId, 1), cL = await codeOfRow(importId, 2);
console.log("codes", cH, cL);
const sH = await login("student", H.email);
const rH = await sH.post("/api/intern/drive-codes/redeem", { code: cH, declaredAdult: true });
const memH = (await q("select college_id,status,left_at from college_memberships where user_id=$1", [H.id]))[0];
check("denied H redeeming own drive code does not become a member", !(memH && memH.college_id === JKLU && memH.left_at === null), `status=${rH.status} body=${rH.text.slice(0, 200)} mem=${JSON.stringify(memH)}`);
check("  ...and gets a clean 4xx, not a 500", rH.status >= 400 && rH.status < 500, `${rH.status} ${rH.text.slice(0, 200)}`);
const payH = await q("select gateway,status from intern_payments where intern_id=$1", [H.id]);
const entH = await q("select * from drive_entitlements where intern_id=$1", [H.id]);
check("  ...no waiver payment / seat burned for denied H", payH.length === 0 && entH.length === 0, JSON.stringify({ payH, entH: entH.length }));
const sLg = await login("student", L.email);
const rL = await sLg.post("/api/intern/drive-codes/redeem", { code: cL, declaredAdult: true });
const memL = (await q("select college_id,status,left_at from college_memberships where user_id=$1", [L.id]))[0];
console.log("left L redeems drive code:", rL.status, rL.text.slice(0, 120), JSON.stringify(memL));
console.log(JSON.stringify({ H: H.id, L: L.id }));
await closeDb();
process.exit(failures() ? 1 : 0);
