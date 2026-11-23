// Fixture for the WP1 authz run, on the scratch DB only. Idempotent.
//  - college A = JK Lakshmipat (seeded TPO tpo@jklu.edu.in), college B = JECRC University
//  - a placement officer for B (password copied from A's hash, so it is Findtern@2026)
//  - three students moved from A to B (membership only), one B leave request, one B drive (made through the real API)
//  - four staff accounts with the default admin roles (made through the real staff API)
import { Client, LOGIN, PASSWORD, loggedIn, sql } from "./wp1-lib.mjs";

export const STAFF = {
  sales: { email: "sales.wp1@findtern.dev", role: "exec_sales" },
  ops: { email: "ops.wp1@findtern.dev", role: "exec_operations" },
  accounts: { email: "accounts.wp1@findtern.dev", role: "exec_accounts" },
  admin: { email: "admin2.wp1@findtern.dev", role: "admin" },
};

export async function ensureFixture() {
  const [A] = await sql("select id,name from colleges where name='JK Lakshmipat University'");
  const [B] = await sql("select id,name from colleges where name='JECRC University'");
  const [tpoA] = await sql("select id,email,password from college_admins where college_id=$1 and email='tpo@jklu.edu.in'", [A.id]);
  await sql(
    "insert into college_admins (college_id,name,email,password) values ($1,'JECRC TPO','tpo@jecrc.test',$2) on conflict do nothing",
    [B.id, tpoA.password],
  );
  await sql("update college_admins set terms_accepted_version=(select terms_accepted_version from college_admins where id=$1), terms_accepted_at=now() where email='tpo@jecrc.test'", [tpoA.id]);
  const [tpoB] = await sql("select id,email from college_admins where email='tpo@jecrc.test'");

  let bStudents = await sql(
    "select m.id as membership_id, m.user_id, u.email, u.first_name from college_memberships m join users u on u.id=m.user_id where m.college_id=$1 and m.left_at is null order by u.email",
    [B.id],
  );
  if (bStudents.length < 3) {
    await sql(
      `update college_memberships set college_id=$1 where id in (select m.id from college_memberships m join users u on u.id=m.user_id where m.college_id=$2 and m.status='verified' and u.email like 'bhavna.%' order by u.email limit 3)`,
      [B.id, A.id],
    );
    bStudents = await sql(
      "select m.id as membership_id, m.user_id, u.email, u.first_name from college_memberships m join users u on u.id=m.user_id where m.college_id=$1 and m.left_at is null order by u.email",
      [B.id],
    );
  }
  const [lr] = await sql("select id from college_leave_requests where college_id=$1 and status='requested' limit 1", [B.id]);
  let leaveB = lr?.id;
  if (!leaveB) {
    const s = bStudents[0];
    [{ id: leaveB }] = await sql(
      "insert into college_leave_requests (college_id,membership_id,user_id,status,reason) values ($1,$2,$3,'requested','wp1 fixture') returning id",
      [B.id, s.membership_id, s.user_id],
    );
  }

  const tB = await loggedIn("college", "tpo@jecrc.test");
  let [driveB] = await sql("select id from college_drives where college_id=$1 order by created_at limit 1", [B.id]);
  if (!driveB) {
    const day = 24 * 3600_000;
    const r = await tB.req("POST", "/api/college/drives", {
      json: { title: "JECRC placement drive", kind: "internship", startsAt: new Date(Date.now() - day).toISOString(), endsAt: new Date(Date.now() + 20 * day).toISOString(), eligibility: {}, includeUserIds: [], excludeUserIds: [] },
    });
    if (r.status !== 201) throw new Error("B drive create " + r.status + r.text);
    [driveB] = await sql("select id from college_drives where id=$1", [r.json.id]);
  }
  const [driveA] = await sql("select id,title from college_drives where college_id=$1 order by created_at limit 1", [A.id]);

  // staff through the real API (super admin)
  const sa = await loggedIn("admin", "admin@findtern.dev");
  await sa.req("GET", "/api/admin/colleges/settings"); // first /api/admin hit seeds the default roles
  for (const s of Object.values(STAFF)) {
    const [have] = await sql("select id from admins where email=$1", [s.email]);
    if (!have) {
      const r = await sa.req("POST", "/api/admin/staff", { json: { name: s.role, email: s.email, password: PASSWORD, role: s.role } });
      if (r.status >= 300) throw new Error(`staff ${s.email} -> ${r.status} ${r.text}`);
    }
  }
  const [studentA] = await sql(
    "select m.user_id, u.email from college_memberships m join users u on u.id=m.user_id where m.college_id=$1 and m.left_at is null and u.email like 'aarav.%' order by u.email limit 1",
    [A.id],
  );
  return { A, B, tpoA, tpoB, bStudents, leaveB, driveA, driveB: driveB, studentA };
}

if (process.argv[1]?.endsWith("wp1-fixture.mjs")) {
  const f = await ensureFixture();
  console.log(JSON.stringify({ A: f.A.id, B: f.B.id, tpoB: f.tpoB.email, bStudents: f.bStudents.map((s) => s.email), leaveB: f.leaveB, driveB: f.driveB.id }, null, 1));
}
