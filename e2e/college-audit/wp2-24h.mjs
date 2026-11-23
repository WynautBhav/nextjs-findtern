// WP2: the dashboard's "last 24 hours" is a rolling window on the instant, independent of the IST day boundary.
// Moves one offer and one hire to 23h59m ago / 24h01m ago and reads the TPO dashboard each time. Restores the rows.
//   DATABASE_URL=postgresql://findtern@127.0.0.1:55490/findtern_ca_wp2 node e2e/college-audit/wp2-24h.mjs
import pg from "pg";
import { login, BASE } from "./wp2-lib.mjs";
const url = process.env.DATABASE_URL ?? "";
if (!/^postgresql:\/\/findtern@127\.0\.0\.1:5549\d\/findtern_ca_[A-Za-z0-9_]+$/.test(url)) throw new Error("refusing: wp2 scratch DB only");
const db = new pg.Client({ connectionString: url, options: "-c TimeZone=UTC" });
await db.connect();
console.log("[24h]", JSON.stringify((await db.query("select current_database() db, inet_server_port() port")).rows[0]));
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const s = await login();
const read = async () => { const t = text(await (await s.get("/college")).text()); return [+t.match(/Last 24 hours:\s*(\d+) new offers/)[1], +t.match(/new offers\s*·\s*(\d+) hires?/)[1]]; };
const oracle = async () => (await db.query(`select
  (select count(*) from proposals p join college_memberships m on m.user_id=p.intern_id and m.status='verified' and m.left_at is null where p.status<>'draft' and p.employer_id<>'admin' and p.created_at > (now() at time zone 'utc') - interval '24 hours') o,
  (select count(*) from proposals p join college_memberships m on m.user_id=p.intern_id and m.status='verified' and m.left_at is null where p.employer_id<>'admin' and p.hired_at > (now() at time zone 'utc') - interval '24 hours') h`)).rows[0];
const target = (await db.query(`select p.id, p.created_at, p.hired_at from proposals p join college_memberships m on m.user_id=p.intern_id and m.status='verified' where p.status='hired' and p.hired_at is not null and p.created_at < now() at time zone 'utc' - interval '3 days' and p.hired_at < now() at time zone 'utc' - interval '3 days' limit 1`)).rows[0];
let bad = 0;
try {
  for (const [label, mins] of [["23h59m ago (inside)", 23 * 60 + 59], ["24h01m ago (outside)", 24 * 60 + 1]]) {
    await db.query(`update proposals set created_at = (now() at time zone 'utc') - make_interval(mins => $2), hired_at = (now() at time zone 'utc') - make_interval(mins => $2) where id=$1`, [target.id, mins]);
    const o = await oracle(), got = await read();
    const ok = got[0] === +o.o && got[1] === +o.h;
    if (!ok) bad++;
    console.log(ok ? "ok  " : "FAIL", label, "page", got, "sql", [+o.o, +o.h]);
  }
} finally {
  await db.query(`update proposals set created_at=$2, hired_at=$3 where id=$1`, [target.id, target.created_at, target.hired_at]);
  await db.end();
}
console.log(bad ? "WP2 24h: FAIL" : "WP2 24h: PASS");
process.exit(bad ? 1 : 0);
