/**
 * Give yourself an admin login on a LOCAL copy of the live database.
 * Upserts the admin row by email with the given password, stored in the
 * legacy plaintext form so the legacy app (run locally) can log in too.
 *
 * Usage: DATABASE_URL=postgresql://…@localhost/findtern_live \
 *        node --experimental-strip-types scripts/make-admin.ts you@findtern.in 'Password1'
 */
import pg from "pg";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) throw new Error("usage: make-admin.ts <email> <password>");
  const url = process.env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|\[::1\])/.test(url)) {
    throw new Error("Refusing: DATABASE_URL must point at localhost");
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `UPDATE admins SET password = $2 WHERE lower(email) = lower($1)`,
      [email, password],
    );
    if (!rowCount) {
      await client.query(
        `INSERT INTO admins (email, password, name, role) VALUES ($1, $2, 'Local admin', 'admin')`,
        [email, password],
      );
    }
    console.log(`${rowCount ? "updated" : "created"} admin ${email}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
