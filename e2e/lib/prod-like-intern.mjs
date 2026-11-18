/**
 * An intern shaped like the one an owner could not edit in production: Ph.D, completed, activation fee paid through a
 * 100%-off promo (gateway "free"), approved, hidden from employers, four ratings stored, an EMPTY score and no
 * `cgpaVerification`. Cloned from a seeded intern so every NOT NULL column is filled. Local throwaway database only.
 */

const TAG = "e2eAcademicsEdit";

/** Insert the intern (and an optional ops admin); returns ids. `pool` is a pg Pool on the scratch database. */
export async function seedProdLikeIntern(pool, { email = `e2e-acad-${Date.now().toString(36)}@findtern.test` } = {}) {
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  const [src] = await q("select id from users where email = 'candidate@findtern.dev'");
  if (!src) throw new Error("run scripts/seed.ts first (needs candidate@findtern.dev)");
  const [{ id }] = await q("select gen_random_uuid()::text id");
  await q(
    `insert into users select (jsonb_populate_record(null::users, to_jsonb(t) || jsonb_build_object('id', $1::text, 'email', $2::text, 'first_name', 'Acad', 'last_name', 'Probe', 'phone_number', '9' || lpad((floor(random()*1e9))::text, 9, '0')))).* from users t where t.id = $3`,
    [id, email, src.id],
  );
  const extra = {
    ratings: { coding: 7, aptitude: 6.5, interview: 7.5, communication: 8 },
    findternScore: 7.3,
    approvalStatus: "Approved",
    openToWork: true,
    hiddenByAdmin: true,
    hiddenAt: new Date().toISOString(),
    payment: { isPaid: true },
    certNote: "keep-me",
    academics: {
      level: "phd",
      degree: "cvb b",
      institution: "cbgh",
      status: "Completed",
      startYear: "2022",
      endYear: "2026",
      score: "",
      scoreType: "",
      certifications: [{ id: "c1", name: "Keep this cert", issuer: "Acme", completionDate: "2024-01-01" }],
      professionalCourses: [{ id: "p1", name: "CA", level: "Final", status: "Completed", issuer: "ICAI" }],
    },
    [TAG]: "1",
  };
  await q(
    `insert into intern_onboarding select (jsonb_populate_record(null::intern_onboarding, to_jsonb(t) || jsonb_build_object('id', gen_random_uuid()::text, 'user_id', $1::text, 'aadhaar_number', null, 'pan_number', null, 'extra_data', $2::jsonb))).* from intern_onboarding t where t.user_id = $3`,
    [id, JSON.stringify(extra), src.id],
  );
  await q("insert into intern_payments (intern_id, gateway, order_id, amount_minor, status, paid_at) values ($1, 'free', $2, 0, 'paid', now())", [id, `free_${id}`]);
  return { id, email, tag: TAG };
}

/** An admin with this role key (the seed's `exec_operations` holds interns:write; `admin` is read-only). */
export async function seedAdmin(pool, { email, role, password = "Findtern@2026" }) {
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  const [src] = await q("select password from admins where email = 'admin@findtern.dev'");
  await q("delete from admins where email = $1", [email]);
  await q("insert into admins (email, password, name, role) values ($1, $2, $3, $4)", [email, src.password, `E2E ${role}`, role]);
  return { email, password };
}

export async function cleanIntern(pool, id) {
  await pool.query("delete from admin_audit_log where target_id = $1", [id]);
  await pool.query("delete from notifications where recipient_id = $1", [id]).catch(() => {});
  await pool.query("delete from intern_payments where intern_id = $1", [id]);
  await pool.query("delete from intern_onboarding where user_id = $1", [id]);
  await pool.query("delete from users where id = $1", [id]);
}
