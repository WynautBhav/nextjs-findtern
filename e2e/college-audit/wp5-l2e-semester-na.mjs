// WP5: "Semester not applicable" (currentSemester 0): proof slot rules, save, admin/officer labels.
import { login, q, mkUser, check, failures, closeDb, SFX, BASE, JKLU } from "./wp5-lib.mjs";
import { deflateSync } from "node:zlib";
import { crc32 } from "../../src/lib/xlsx.ts";
const png = (size, rgb) => {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([len, body, c]); };
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};
const u = await mkUser({ first: "Sem", last: "Na", email: `sem.na.${SFX}@jklu.edu.in` });
const st = await login("student", u.email);
const cookie = () => [...st.jar].map(([k, v]) => `${k}=${v}`).join("; ");
const up = async (name, rgb) => {
  const r = await fetch(BASE + "/api/uploads", { method: "POST", headers: { origin: BASE, cookie: cookie(), "x-csrf-token": st.jar.get("ft_csrf"), "content-type": "image/png", "x-document-kind": "certificate", "x-file-name": encodeURIComponent(name), "x-forwarded-for": "10.9.9.9" }, body: png(48, rgb) });
  const j = await r.json().catch(() => null);
  return { status: r.status, body: j };
};
const acad = (over = {}) => ({ qualificationLevel: "Bachelor's", institution: "JK Lakshmipat University", degree: "B.Tech", branch: "", startYear: "2023", yearOfGraduation: "", status: "Pursuing", scoreType: "cgpa", cgpa: "8.4", ...over });
const save = (a) => st.post("/api/intern/onboarding", { academics: a });
const none = await save(acad({ currentSemester: 0 }));
check("semester 0 with a score and no proof -> 400 naming the last-year marksheet", none.status === 400 && Object.keys(none.json.fields ?? {}).join() === "proof-last-year-marksheet", `${none.status} ${none.text.slice(0, 200)}`);
const f = await up("last-year.png", [20, 100, 160]);
check("proof upload ok", f.status === 201, JSON.stringify(f.body)?.slice(0, 120));
const proof = { name: f.body.key, originalName: "last-year.png", type: f.body.contentType, size: f.body.bytes };
const ok = await save(acad({ currentSemester: 0, semesterProofUploads: { "last-year-marksheet": proof } }));
check("semester 0 + last-year marksheet saves", ok.status === 200, `${ok.status} ${ok.text.slice(0, 200)}`);
const x = (await q("select extra_data from intern_onboarding where user_id=$1", [u.id]))[0]?.extra_data;
check("stored semester 0 and verification pending with semester 0", x?.academics?.currentSemester === 0 && x?.cgpaVerification?.status === "pending" && x.cgpaVerification.semester === 0, JSON.stringify(x?.cgpaVerification));
const wrong = await save(acad({ currentSemester: 0, semesterProofUploads: { "marksheet-1": proof, "college-id": proof, "last-year-marksheet": proof } }));
console.log("extra slots for semester 0:", wrong.status, wrong.text.slice(0, 150));
// admin queue label
const admin = await login("admin", "admin@findtern.dev");
const q1 = await admin.get("/admin/cgpa-verifications");
const t = q1.text.replace(/<!-- -->/g, "");
console.log("admin CGPA queue mentions 'Semester not applicable':", /Semester not applicable/.test(t), "| 'Semester 0':", /Semester 0\b/.test(t));
check("admin never sees the raw 'Semester 0'", !/Semester 0\b/.test(t));
const csv = await admin.get("/api/admin/cgpa-verifications/export");
console.log("export status", csv.status, /Semester not applicable|,0,/.test(csv.text.slice(0, 20000)) ? "has NA/0 rows" : "no NA rows in first 20k");
await closeDb();
process.exit(failures() ? 1 : 0);
