// What a real student does: pick "Bachelor's", the start year and the current semester, upload one marksheet photo per earlier semester + the college ID,
// and save. sync-enter.mjs sent the academics WITHOUT qualificationLevel/startYear (SYNC-04: harness defect, the API then keeps no semester). This puts the semesters in
// through the real onboarding API and reads them back from intern_onboarding.
//   BASE=... DATABASE_URL=... LEDGER=ledger.json node --experimental-strip-types e2e/college-audit/sync-fix-sem.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { q, one, sessionAny, closeDb, png, BASE } from "./sync-lib.mjs";

const led = JSON.parse(readFileSync(process.env.LEDGER, "utf8"));
const slots = (sem) => (sem === 0 ? ["last-year-marksheet"] : [...Array.from({ length: sem - 1 }, (_, i) => `marksheet-${i + 1}`), "college-id"]);
let ok = 0;
// The form wants 4-7 key skills, and the round-1 entry typed 1-3 while the profile was still incomplete. The staged AI interview locks the skill list, so the
// missing ones are added by SQL (what a student would have typed first), and the ledger is updated to match.
const FILL = ["HTML", "CSS", "Git", "JavaScript", "Excel"];
for (const i of led.interns) {
  const have = i.typed.skillsRestagedFrom ?? i.typed.skills;
  const all = [...have, ...FILL.filter((x) => !have.includes(x))].slice(0, Math.max(4, have.length));
  if (all.length !== have.length) {
    await q("UPDATE intern_onboarding o SET skills = $2::jsonb FROM users u WHERE u.id = o.user_id AND u.email = $1", [i.email, JSON.stringify(all.map((name, n) => ({ id: `skill-sync-${n}`, name, rating: 2 })))]);
    i.typed.skillsRestagedFrom = have; i.typed.skills = all;
  }
}
writeFileSync(process.env.LEDGER, JSON.stringify(led, null, 1));
for (const i of led.interns) {
  const s = await sessionAny("intern", i.email);
  const csrf = decodeURIComponent((s.cookie().match(/ft_csrf=([^;]+)/) ?? [])[1] ?? "");
  const cur = (await one("SELECT o.extra_data->'academics' a FROM intern_onboarding o JOIN users u ON u.id = o.user_id WHERE u.email = $1", [i.email])).a;
  const proofs = {};
  for (const key of slots(i.typed.semester)) {
    const res = await fetch(BASE + "/api/uploads", { method: "POST", headers: { origin: BASE, cookie: s.cookie(), "x-csrf-token": csrf, "content-type": "image/png", "x-document-kind": "certificate", "x-file-name": encodeURIComponent(`${key}.png`) }, body: png(48, [20 + Object.keys(proofs).length, 100, 160]) });
    const pj = await res.json().catch(() => ({}));
    if (res.status >= 300) throw new Error(`upload ${key}: ${res.status}`);
    proofs[key] = { name: pj.key, originalName: `${key}.png`, type: pj.contentType, size: pj.bytes };
  }
  const academics = { qualificationLevel: "Bachelor's", institution: cur.institution, degree: cur.degree, branch: cur.specialization, startYear: String(Number(cur.endYear) - 4), yearOfGraduation: cur.endYear, scoreType: "cgpa", cgpa: cur.score, status: "Pursuing", currentSemester: i.typed.semester, semesterProofUploads: proofs };
  const r = await s.post("/api/intern/onboarding", { academics });
  const got = (await one("SELECT o.extra_data->'academics'->'currentSemester' sem, o.extra_data->'academics'->>'level' lvl, o.extra_data->'cgpaVerification'->>'status' cv FROM intern_onboarding o JOIN users u ON u.id = o.user_id WHERE u.email = $1", [i.email]));
  const good = r.status === 200 && got.sem === i.typed.semester;
  if (good) ok++;
  console.log(`${good ? "ok  " : "FAIL"} ${i.email} typed sem ${i.typed.semester} -> HTTP ${r.status}, stored sem ${JSON.stringify(got.sem)}, level ${JSON.stringify(got.lvl)}, cgpaVerification ${got.cv} ${good ? "" : r.text.slice(0, 200)}`);
}
console.log(`${ok}/${led.interns.length} semesters stored`);
await closeDb();
