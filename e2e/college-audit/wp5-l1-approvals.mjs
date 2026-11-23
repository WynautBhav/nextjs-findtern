// WP5 L1: approvals (accept / deny / add back), the email+name rule, admin-only weaker matches, denied student cannot rejoin.
//   source ~/.cache/findtern-college-audit/env.sh; use_wp 5; node e2e/college-audit/wp5-l1-approvals.mjs
import { login, q, mkUser, check, failures, closeDb, SFX, JKLU, JKLU_CODE, POORNIMA_CODE, POORNIMA } from "./wp5-lib.mjs";

const tpo = await login("tpo", "tpo@jklu.edu.in");
const admin = await login("admin", "admin@findtern.dev");
const decide = (api, ids, action) => api.post("/api/college/students/decide", { userIds: ids, action });
const adminDecide = (ids, action) => admin.post(`/api/admin/colleges/${JKLU}/students`, { userIds: ids, action });
const mem = async (id) => (await q("select college_id,status,verified_by,left_at from college_memberships where user_id=$1", [id]))[0];

const A = await mkUser({ first: "Asha", last: "Rao", email: `asha.rao.${SFX}@gmail.com` }); // list + same name
const B = await mkUser({ first: "Vikram", last: "Mehta", email: `vikram.${SFX}@gmail.com` }); // list email, different name
const C = await mkUser({ first: "Carl", last: "Dsouza", email: `carl.${SFX}@gmail.com`, verified: false }); // unverified
const D = await mkUser({ first: "Diya", last: "Jain", email: `diya.${SFX}@gmail.com`, phone: "9811100001" }); // phone-only
const E = await mkUser({ first: "Eve", last: "Stranger", email: `eve.${SFX}@gmail.com` }); // nowhere
const F = await mkUser({ first: "Farah", last: "Khan", email: `farah.${SFX}@gmail.com` }); // in Poornima
const G = await mkUser({ first: "Gina", last: "Paul", email: `gina.${SFX}@jklu.edu.in` }); // college domain
const I = await mkUser({ first: "Ivan", last: "Roy", email: `ivan.${SFX}@gmail.com`, active: false }); // disabled
const Fr = await mkUser({ first: "Fred", last: "Frozen", email: `fred.${SFX}@gmail.com`, frozen: true });
await q("insert into college_memberships (user_id,college_id,status,verified_by) values ($1,$2,'verified','college_code')", [F.id, POORNIMA]);

const csv = [
  "Name,Email,Phone",
  `Asha Rao,${A.email},`,
  `Ravi Kumar,${B.email},`,
  `Carl Dsouza,${C.email},`,
  `Diya Jain,diya.alt.${SFX}@college.in,9811100001`,
  `Farah Khan,${F.email},`,
  `Ivan Roy,${I.email},`,
  `Fred Frozen,${Fr.email},`,
].join("\n");
const imp = await tpo.post("/api/college/roster", { csv });
check("roster import ok", imp.status === 200, JSON.stringify(imp.json));

const html = async (p) => (await tpo.get(p)).text;
const page = await html("/college/approvals");
const approvalsWaiting = (name) => page.includes(name);
check("A (list, same name) offered to TPO", approvalsWaiting("Asha Rao"));
check("G (college domain) offered", approvalsWaiting("Gina Paul"));
check("B (list email, different name) NOT shown to TPO", !approvalsWaiting("Vikram") && !approvalsWaiting("Ravi Kumar"));
check("C (unverified) NOT shown", !approvalsWaiting("Carl Dsouza"));
check("D (phone only) NOT shown (no name/phone leak)", !approvalsWaiting("Diya") && !page.includes("9811100001") && !page.includes("1001"));
check("E stranger NOT shown", !approvalsWaiting("Eve"));
check("F (other college member) NOT shown", !approvalsWaiting("Farah"));
check("I (disabled) NOT shown", !approvalsWaiting("Ivan"));
console.log("Fred (frozen, list name match) shown to TPO:", approvalsWaiting("Fred Frozen"));

// accept by id the TPO is not offered
for (const [n, u] of [["B", B], ["C", C], ["D", D], ["E", E], ["F", F], ["I", I]]) {
  const r = await decide(tpo, [u.id], "accept");
  check(`TPO accept ${n} refused`, r.status === 404, `${r.status} ${r.text.slice(0, 80)}`);
  check(`  ${n} has no membership of JKLU`, !(await mem(u.id)) || (await mem(u.id)).college_id !== JKLU);
}
// admin can accept B (name) and D (phone) but not E / C / F
const ra = await adminDecide([B.id], "accept");
check("admin accepts B (name review)", ra.status === 200, ra.text.slice(0, 100));
const rd = await adminDecide([D.id], "accept");
check("admin accepts D (phone review)", rd.status === 200, rd.text.slice(0, 100));
for (const [n, u] of [["C", C], ["E", E], ["F", F], ["I", I]]) {
  const r = await adminDecide([u.id], "accept");
  check(`admin accept ${n} refused`, r.status === 404, `${r.status}`);
}

// accept A and G
const ok = await decide(tpo, [A.id, G.id], "accept");
check("TPO accepts A and G", ok.status === 200 && ok.json.done === 2, ok.text);
check("A is verified member", (await mem(A.id))?.status === "verified" && (await mem(A.id)).college_id === JKLU);
const again = await decide(tpo, [A.id], "accept");
check("accept twice is idempotent", again.status === 200, again.text);
const notes = await q("select title, message, type from notifications where user_id=$1 order by created_at", [A.id]).catch(async () => q("select * from notifications where recipient_id=$1", [A.id]));
console.log("A notifications:", JSON.stringify(notes));

// deny A -> cannot rejoin
const den = await decide(tpo, [A.id], "deny");
check("deny A", den.status === 200, den.text);
check("A left (membership ended)", (await mem(A.id))?.left_at !== null);
const studA = await login("student", A.email);
const j1 = await studA.post("/api/intern/college", { code: JKLU_CODE, year: 3, branch: "CSE", declaredAdult: true });
check("denied A cannot rejoin with TPO code", j1.status === 409 && /removed you/.test(j1.text), `${j1.status} ${j1.text}`);
const page2 = await html("/college/approvals");
check("denied A not offered again", !page2.includes("Asha Rao") || page2.indexOf("Asha Rao") > page2.indexOf("Removed"), "(appears only in removed)");
const j2 = await decide(tpo, [A.id], "accept");
check("denied A cannot be re-accepted without restore", j2.status === 404, `${j2.status}`);
// SQL-level: the DB trigger is the final backstop
let trig = null;
try { await q("update college_memberships set left_at=null, status='verified' where user_id=$1", [A.id]); } catch (e) { trig = e.message; }
check("DB trigger refuses reopening denied membership", trig === "college_membership_denied", trig);
// restore
const rs = await decide(tpo, [A.id], "restore");
check("restore A", rs.status === 200, rs.text);
check("A is a member again", (await mem(A.id))?.left_at === null && (await mem(A.id)).status === "verified");

// student already in college B cannot join A by TPO code
const jf = await (await login("student", F.email)).post("/api/intern/college", { code: JKLU_CODE, year: 2, branch: "BBA", declaredAdult: true });
check("F (in Poornima) cannot join JKLU by code", jf.status === 409, `${jf.status} ${jf.text}`);
check("F still in Poornima", (await mem(F.id)).college_id === POORNIMA);
console.log("failures:", failures());
console.log(JSON.stringify({ A: A.id, B: B.id, D: D.id, G: G.id, F: F.id, Fr: Fr.id }));
await closeDb();
process.exit(failures() ? 1 : 0);
