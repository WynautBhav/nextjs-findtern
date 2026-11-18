/**
 * Scratch-DB prep so every [id] route has data for the sweep persona:
 * enrols the demo employer (hiring@northwind.dev) in the first college drive,
 * which /employer/drives/[id] requires. Loopback databases only (testDatabaseUrl).
 */
import { closeDb, rows } from "../lib/db.mjs";

const drive = (await rows(`SELECT id FROM college_drives ORDER BY created_at LIMIT 1`))[0];
const emp = (await rows(`SELECT id FROM employers WHERE lower(company_email) = 'hiring@northwind.dev'`))[0];
if (!drive || !emp) {
  console.error("prep: no college drive or demo employer; run scripts/seed.ts and scripts/seed-colleges.ts first");
  process.exit(1);
}
await rows(
  `INSERT INTO college_drive_employers (drive_id, employer_id)
   SELECT $1::text, $2::text WHERE NOT EXISTS (SELECT 1 FROM college_drive_employers WHERE drive_id = $1::text AND employer_id = $2::text)`,
  [drive.id, emp.id],
);
console.log(`prep: employer ${emp.id} enrolled in drive ${drive.id}`);
await closeDb();
