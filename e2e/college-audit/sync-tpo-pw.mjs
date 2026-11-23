// Reset a college admin's (TPO's) password through the admin API (the app's own reset flow); the new one goes to the 0600 secrets file only.
//   node --experimental-strip-types e2e/college-audit/sync-tpo-pw.mjs tpo.o30u@synctest.edu.in
import { q, session, saveSecret, closeDb } from "./sync-lib.mjs";

const email = process.argv[2];
const [a] = await q("SELECT id, college_id FROM college_admins WHERE lower(email) = lower($1)", [email]);
if (!a) throw new Error("no such college admin");
const admin = await session("admin", process.env.ADMIN_EMAIL ?? "admin@findtern.dev");
const r = await admin.post(`/api/admin/colleges/${a.college_id}/admins/${a.id}/reset-password`);
if (r.status !== 200 || !r.json?.password) throw new Error(`reset failed ${r.status}`);
saveSecret(email, r.json.password);
console.log(`reset ok for ${email}; password stored in the secrets file (not printed)`);
await closeDb();
