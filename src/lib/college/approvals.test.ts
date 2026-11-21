import assert from "node:assert/strict";
import test from "node:test";

import pg from "pg";

import { candidatesIn, decideStudentIn, domainPatterns, removedIn, reviewsIn } from "./approvals.ts";

test("domainPatterns: the domain and its subdomains, wildcards escaped, junk dropped", () => {
  assert.deepEqual(domainPatterns(["JKLU.edu.in", "@x_y.ac.in", "", "not a domain", "%.com"]), ["%@jklu.edu.in", "%.jklu.edu.in"]);
});

/**
 * The SQL itself, against a real Postgres, inside a transaction that is always rolled back.
 * Set APPROVALS_TEST_DATABASE_URL to a LOCAL migrated database to run it; skipped otherwise.
 */
const url = process.env.APPROVALS_TEST_DATABASE_URL;
const local = url ? ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname) : false;

test("accept, deny and restore against Postgres", { skip: !url || !local ? "APPROVALS_TEST_DATABASE_URL is not a local database" : false }, async () => {
  const client = new pg.Client(url);
  await client.connect();
  try {
    await client.query("BEGIN");
    const id = async (sql: string, p: unknown[]) => String((await client.query(sql, p)).rows[0].id);
    const college = await id("INSERT INTO colleges (name, slug, email_domains, is_partner) VALUES ('Test College','t-approvals','[\"tc.edu.in\"]',true) RETURNING id", []);
    const other = await id("INSERT INTO colleges (name, slug, is_partner) VALUES ('Other College','t-approvals-2',true) RETURNING id", []);
    let n = 0;
    const user = (first: string, last: string, email: string, verified = true, phone?: string) =>
      id("INSERT INTO users (first_name, last_name, email, password, email_verified, phone_number) VALUES ($1,$2,$3,'x',$4,$5) RETURNING id", [first, last, email, verified, phone ?? `70000000${String(++n).padStart(2, "0")}`]);
    const onList = await user("Asha", "Rao", "asha.rao@gmail.com");
    const onDomain = await user("Dev", "Jain", "dev@cs.tc.edu.in");
    const unverified = await user("Un", "Verified", "b@tc.edu.in", false);
    const stranger = await user("A", "Stranger", "stranger@gmail.com");
    // The officer typed a stranger's email under their own student's name: a list row proves nothing by itself.
    const victim = await user("Victim", "Person", "victim@gmail.com");
    const elsewhere = await user("Else", "Where", "c@tc.edu.in");
    const byPhone = await user("Phone", "Kid", "personal@gmail.com", true, "9811122233");
    await client.query("INSERT INTO college_memberships (user_id, college_id, status) VALUES ($1,$2,'verified')", [elsewhere, other]);
    await client.query(
      "INSERT INTO college_roster (college_id, email, name, year, branch, phone) VALUES ($1,'asha.rao@gmail.com','Rao Asha',3,'CSE',NULL), ($1,'kid@tc.edu.in','Phone Kid',2,'ECE','9811122233'), ($1,'victim@gmail.com','Some Student',4,'ME',NULL)",
      [college],
    );
    const domains = ["tc.edu.in"];
    const actor = { type: "college_admin" as const, id: "tpo-1" };
    const decide = (userId: string, action: "accept" | "deny" | "restore", extra: { asAdmin?: boolean; collegeId?: string } = {}) =>
      decideStudentIn(client, { collegeId: extra.collegeId ?? college, domains: extra.collegeId ? [] : domains, userId, action, actor, note: null, asAdmin: extra.asAdmin });
    const membership = async (userId: string) => (await client.query("SELECT college_id, status, verified_by, year, branch, left_at FROM college_memberships WHERE user_id = $1", [userId])).rows[0];

    const offered = await candidatesIn(client, college, domains);
    assert.deepEqual(offered.map((c) => c.userId).sort(), [onList, onDomain].sort(), "only the name-confirmed list match and the verified college email are offered");
    assert.equal(offered.find((c) => c.userId === onList)?.name, "Rao Asha", "a list match shows the name the officer typed");
    assert.equal(JSON.stringify(offered).includes("7000000"), false, "no account phone reaches the officer before accept");
    const reviews = await reviewsIn(client, college, domains);
    assert.deepEqual(reviews.map((r) => [r.userId, r.kind]).sort(), [[byPhone, "phone"], [victim, "name"]].sort(), "weak matches wait for a Findtern admin");

    // The id comes from a browser: anyone not on the officer's list is a 404, for accept and for deny.
    for (const u of [stranger, unverified, elsewhere, byPhone, victim]) {
      assert.equal((await decide(u, "accept")).ok, false);
      assert.equal((await decide(u, "deny")).ok, false);
    }
    assert.equal((await membership(elsewhere)).college_id, other, "another college's student is untouched");
    assert.equal(await membership(victim), undefined, "a stranger typed into the list gets no membership row");

    assert.deepEqual(await decide(onList, "accept"), { ok: true, action: "accept", userId: onList, already: false });
    const m = await membership(onList);
    assert.deepEqual([m.status, m.verified_by, m.year, m.branch, m.left_at], ["verified", "tpo", 3, "CSE", null]);
    assert.deepEqual(await decide(onList, "accept"), { ok: true, action: "accept", userId: onList, already: true });

    // Deny a member: out of every read (left_at), listed as removed, not offered again, and no writer can put them back.
    assert.equal((await decide(onList, "deny")).ok, true);
    assert.notEqual((await membership(onList)).left_at, null);
    assert.deepEqual((await removedIn(client, college)).map((r) => r.userId), [onList]);
    assert.equal((await candidatesIn(client, college, domains)).some((c) => c.userId === onList), false);
    await client.query("SAVEPOINT s");
    await assert.rejects(client.query("UPDATE college_memberships SET left_at = NULL WHERE user_id = $1", [onList]), /college_membership_denied/);
    await client.query("ROLLBACK TO SAVEPOINT s");
    // Joining ANOTHER college is still allowed, and does not erase this college's denial.
    await client.query("UPDATE college_memberships SET college_id = $2, left_at = NULL, status = 'verified' WHERE user_id = $1", [onList, other]);
    assert.deepEqual((await removedIn(client, college)).map((r) => r.userId), [onList], "the denial outlives a join elsewhere");
    // Another college's officer cannot restore or deny our student; ours can restore, but a live membership elsewhere is kept.
    assert.equal((await decide(onDomain, "restore", { collegeId: other })).ok, false);
    assert.equal((await decide(onList, "restore")).ok, true);
    assert.equal((await membership(onList)).college_id, other, "restore never takes a student out of another college");
    assert.deepEqual(await removedIn(client, college), []);

    // Deny someone who never joined: a denial only, no membership row is made or touched.
    assert.equal((await decide(onDomain, "deny")).ok, true);
    assert.equal(await membership(onDomain), undefined);
    await client.query("SAVEPOINT s2");
    await assert.rejects(client.query("INSERT INTO college_memberships (user_id, college_id, status) VALUES ($1,$2,'verified')", [onDomain, college]), /college_membership_denied/);
    await client.query("ROLLBACK TO SAVEPOINT s2");
    assert.equal((await decide(onDomain, "restore")).ok, true);
    assert.equal((await membership(onDomain)).status, "verified");

    // Weak matches are an admin's call, each one.
    assert.equal((await decide(byPhone, "accept", { asAdmin: true })).ok, true);
    const p = await membership(byPhone);
    assert.deepEqual([p.status, p.year, p.branch], ["verified", 2, "ECE"]);
    assert.equal((await decide(victim, "accept", { asAdmin: true })).ok, true);
    assert.equal((await decide(stranger, "accept", { asAdmin: true })).ok, false, "an admin cannot add someone with no match at all");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
});
