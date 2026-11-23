// WP5 R1: double-click Accept on a NEW candidate (no membership row yet) must have one effect: one audit row, one bell.
import { login, q, mkUser, check, failures, closeDb, SFX } from "./wp5-lib.mjs";
const tpo = await login("tpo", "tpo@jklu.edu.in");
const users = [];
for (let i = 0; i < 8; i++) users.push(await mkUser({ first: `Dbl${i}`, last: "Click", email: `dbl${i}.${SFX}@jklu.edu.in` }));
await Promise.all(users.map((u) => Promise.all([tpo.post("/api/college/students/decide", { userIds: [u.id], action: "accept" }), tpo.post("/api/college/students/decide", { userIds: [u.id], action: "accept" })])));
let bad = 0;
for (const u of users) {
  const bells = (await q("select count(*)::int n from notifications where recipient_id=$1 and type='college_membership_decided'", [u.id]))[0].n;
  const audits = (await q("select count(*)::int n from college_audit_log where subject_user_id=$1 and action='student.accepted'", [u.id]))[0].n;
  if (bells !== 1 || audits !== 1) { bad++; console.log("  ", u.email, { bells, audits }); }
}
check("8 students accepted by two parallel requests each: exactly 1 bell and 1 audit row each", bad === 0, `${bad} of 8 doubled`);
// same for deny and restore
await Promise.all(users.map((u) => Promise.all([tpo.post("/api/college/students/decide", { userIds: [u.id], action: "deny" }), tpo.post("/api/college/students/decide", { userIds: [u.id], action: "deny" })])));
let badD = 0;
for (const u of users) {
  const bells = (await q("select count(*)::int n from notifications where recipient_id=$1 and title like '% removed you%'", [u.id]))[0].n;
  const audits = (await q("select count(*)::int n from college_audit_log where subject_user_id=$1 and action='student.denied'", [u.id]))[0].n;
  if (bells !== 1 || audits !== 1) badD++;
}
check("parallel deny: one effect each", badD === 0, `${badD} of 8 doubled`);
await Promise.all(users.map((u) => Promise.all([tpo.post("/api/college/students/decide", { userIds: [u.id], action: "restore" }), tpo.post("/api/college/students/decide", { userIds: [u.id], action: "restore" })])));
let badR = 0;
for (const u of users) {
  const bells = (await q("select count(*)::int n from notifications where recipient_id=$1 and title like '% added you back'", [u.id]))[0].n;
  const audits = (await q("select count(*)::int n from college_audit_log where subject_user_id=$1 and action='student.restored'", [u.id]))[0].n;
  if (bells !== 1 || audits !== 1) badR++;
}
check("parallel restore: one effect each", badR === 0, `${badR} of 8 doubled`);
await closeDb();
process.exit(failures() ? 1 : 0);
