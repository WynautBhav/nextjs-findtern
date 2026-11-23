// SYNC-04 settle: does the onboarding API drop currentSemester? Posts the SAME academics as sync-enter did (no qualificationLevel) and then
// with qualificationLevel "Bachelor's" (what the real form always sends) for one entered intern, reads intern_onboarding.extra_data back.
//   BASE=http://localhost:3337 DATABASE_URL=... node --experimental-strip-types e2e/college-audit/sync-sem04.mjs <email> <semester>
import { q, one, sessionAny, closeDb } from "./sync-lib.mjs";

const [email, semRaw] = process.argv.slice(2);
const sem = Number(semRaw);
const s = await sessionAny("intern", email);
const cur = (await one("SELECT o.extra_data->'academics' a FROM intern_onboarding o JOIN users u ON u.id = o.user_id WHERE u.email = $1", [email])).a;
const stored = async () => (await one("SELECT o.extra_data->'academics'->'currentSemester' s, o.extra_data->'academics'->>'level' lvl, o.extra_data->'academics'->'semesterProofUploads' pr FROM intern_onboarding o JOIN users u ON u.id = o.user_id WHERE u.email = $1", [email]));
const base = { institution: cur.institution, degree: cur.degree, branch: cur.specialization, yearOfGraduation: cur.endYear, scoreType: "cgpa", cgpa: cur.score, status: "Pursuing", currentSemester: sem };
console.log("stored before:", JSON.stringify(await stored()));
let r = await s.post("/api/intern/onboarding", { academics: base });
console.log("A) no qualificationLevel ->", r.status, r.text.slice(0, 250), "stored:", JSON.stringify(await stored()));
r = await s.post("/api/intern/onboarding", { academics: { ...base, qualificationLevel: "Bachelor's" } });
console.log("B) qualificationLevel Bachelor's, no proofs ->", r.status, r.text.slice(0, 300), "stored:", JSON.stringify(await stored()));
await closeDb();
