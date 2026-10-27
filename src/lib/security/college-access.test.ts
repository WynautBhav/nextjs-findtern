import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-chars-long";

const {
  checkDriveLink,
  checkDriveAccess,
  collegeAdminMay,
  canCollegeAdminSee,
  isStudentEligible,
  membershipFor,
  driveWindow,
} = await import("../college/access.ts");
const { generateDriveToken, hashDriveToken } = await import("../college/tokens.ts");
const { createSession, readSession } = await import("./session.ts");
const { canAccess } = await import("./guards.ts");
const { CONSENT_PURPOSES } = await import("../college/consent.ts");

const NOW = new Date("2026-11-10T10:00:00Z").getTime();
const HOUR = 3600_000;

const { token, hash } = generateDriveToken();

const driveX = {
  id: "drive-x",
  collegeId: "college-x",
  startsAt: new Date(NOW - HOUR),
  endsAt: new Date(NOW + 24 * HOUR),
  revokedAt: null as Date | null,
  tokenHash: hash,
  eligibility: { minCgpa: 6, years: [3, 4] } as Record<string, unknown>,
  includeUserIds: [] as string[],
  excludeUserIds: [] as string[],
};

const employer = { uid: "emp-1", role: "employer" as const };
const allPurposes = [...CONSENT_PURPOSES];

function student(over: Partial<Parameters<typeof isStudentEligible>[0]> = {}) {
  return {
    userId: "stu-1",
    collegeId: "college-x",
    status: "verified" as const,
    leftAt: null,
    purposes: allPurposes,
    year: 3,
    branch: "CSE",
    cgpa: 7.5,
    score: 7,
    ...over,
  };
}

// ── Drive links ─────────────────────────────────────────────────────────

test("tokens: 256-bit, only the hash is stored, hash is stable", () => {
  assert.ok(Buffer.from(token, "base64url").length >= 32);
  assert.equal(hashDriveToken(token), hash);
  assert.notEqual(hash, token);
  assert.notEqual(generateDriveToken().hash, hash);
});

test("valid link + signed-in employer inside the window is allowed", () => {
  assert.deepEqual(checkDriveLink({ drive: driveX, token, session: employer, now: NOW }), { ok: true });
});

test("signed-out visitor is sent to sign in, never shown students", () => {
  const r = checkDriveLink({ drive: driveX, token, session: null, now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "sign_in");
});

test("only employers may enter a drive (intern, college admin, admin are refused)", () => {
  for (const role of ["intern", "college", "admin"] as const) {
    const r = checkDriveLink({ drive: driveX, token, session: { uid: "u", role }, now: NOW });
    assert.equal(r.ok, false, role);
    assert.equal(r.ok === false && r.reason, "not_employer");
  }
});

test("wrong token for this drive is refused (cross-college link)", () => {
  const other = generateDriveToken();
  const r = checkDriveLink({ drive: driveX, token: other.token, session: employer, now: NOW });
  assert.equal(r.ok === false && r.reason, "bad_token");
  assert.equal(checkDriveLink({ drive: driveX, token: "", session: employer, now: NOW }).ok, false);
});

test("expired, not-yet-open and revoked links are refused", () => {
  assert.equal(checkDriveLink({ drive: driveX, token, session: employer, now: NOW + 25 * HOUR }).ok, false);
  assert.equal(checkDriveLink({ drive: driveX, token, session: employer, now: NOW - 2 * HOUR }).ok, false);
  const revoked = { ...driveX, revokedAt: new Date(NOW - 1000) };
  const r = checkDriveLink({ drive: revoked, token, session: employer, now: NOW });
  assert.equal(r.ok === false && r.reason, "revoked");
});

test("driveWindow reports the state the landing page shows", () => {
  assert.equal(driveWindow(driveX, NOW), "live");
  assert.equal(driveWindow(driveX, NOW - 2 * HOUR), "upcoming");
  assert.equal(driveWindow(driveX, NOW + 25 * HOUR), "ended");
  assert.equal(driveWindow({ ...driveX, revokedAt: new Date(NOW) }, NOW), "revoked");
});

// ── After the link: every drive API call ───────────────────────────────

test("drive API needs a joined employer, a live window and no revocation", () => {
  assert.deepEqual(checkDriveAccess({ drive: driveX, session: employer, joined: true, now: NOW }), { ok: true });
  assert.equal(checkDriveAccess({ drive: driveX, session: employer, joined: false, now: NOW }).ok, false);
  assert.equal(checkDriveAccess({ drive: driveX, session: employer, joined: true, now: NOW + 25 * HOUR }).ok, false);
  assert.equal(
    checkDriveAccess({ drive: { ...driveX, revokedAt: new Date(NOW) }, session: employer, joined: true, now: NOW }).ok,
    false,
  );
  assert.equal(checkDriveAccess({ drive: driveX, session: null, joined: true, now: NOW }).ok, false);
});

// ── Which students an employer sees ────────────────────────────────────

test("eligible: verified member of this college meeting the cutoffs", () => {
  assert.equal(isStudentEligible(student(), driveX), true);
});

test("cross-college: a student of another college is never eligible, even if included", () => {
  assert.equal(isStudentEligible(student({ collegeId: "college-y" }), driveX), false);
  const including = { ...driveX, includeUserIds: ["stu-1"] };
  assert.equal(isStudentEligible(student({ collegeId: "college-y" }), including), false);
});

test("unverified (claimed) student is hidden unless the college hand-includes them", () => {
  assert.equal(isStudentEligible(student({ status: "claimed" }), driveX), false);
  assert.equal(isStudentEligible(student({ status: "claimed" }), { ...driveX, includeUserIds: ["stu-1"] }), true);
});

test("consent withdrawn, never given for drives, or student left: hidden even if included", () => {
  const inc = { ...driveX, includeUserIds: ["stu-1"] };
  assert.equal(isStudentEligible(student({ leftAt: new Date(NOW) }), inc), false);
  assert.equal(isStudentEligible(student({ purposes: ["college_dashboard"] }), inc), false);
  assert.equal(isStudentEligible(student({ purposes: [] }), inc), false);
});

test("cutoffs: CGPA, Findtern score, year and branch; unknown CGPA fails a CGPA cutoff", () => {
  assert.equal(isStudentEligible(student({ cgpa: 5.9 }), driveX), false);
  assert.equal(isStudentEligible(student({ cgpa: null }), driveX), false);
  assert.equal(isStudentEligible(student({ year: 2 }), driveX), false);
  const byScore = { ...driveX, eligibility: { minScore: 6 } };
  assert.equal(isStudentEligible(student({ score: 5 }), byScore), false);
  assert.equal(isStudentEligible(student({ score: null }), byScore), false);
  const byBranch = { ...driveX, eligibility: { branches: ["ece"] } };
  assert.equal(isStudentEligible(student({ branch: "CSE" }), byBranch), false);
  assert.equal(isStudentEligible(student({ branch: "ECE" }), byBranch), true);
});

test("manual include overrides cutoffs; manual exclude beats everything", () => {
  assert.equal(isStudentEligible(student({ cgpa: 5 }), { ...driveX, includeUserIds: ["stu-1"] }), true);
  assert.equal(isStudentEligible(student(), { ...driveX, excludeUserIds: ["stu-1"] }), false);
  assert.equal(
    isStudentEligible(student(), { ...driveX, includeUserIds: ["stu-1"], excludeUserIds: ["stu-1"] }),
    false,
  );
});

// ── Membership proof ───────────────────────────────────────────────────

test("membership: roster email match verifies", () => {
  const m = membershipFor({ email: "Asha@Gmail.com", emailVerified: true, domains: ["jklu.edu.in"], onRoster: true });
  assert.deepEqual(m, { status: "verified", verifiedBy: "roster" });
});

test("membership: college domain verifies only when the inbox is verified", () => {
  assert.deepEqual(
    membershipFor({ email: "asha@jklu.edu.in", emailVerified: true, domains: ["jklu.edu.in"], onRoster: false }),
    { status: "verified", verifiedBy: "email_domain" },
  );
  assert.deepEqual(
    membershipFor({ email: "asha@jklu.edu.in", emailVerified: false, domains: ["jklu.edu.in"], onRoster: false }),
    { status: "claimed", verifiedBy: null },
  );
});

test("membership: lookalike domains do not verify", () => {
  for (const email of ["a@evil-jklu.edu.in", "a@jklu.edu.in.evil.com", "a@xjklu.edu.in"]) {
    assert.equal(
      membershipFor({ email, emailVerified: true, domains: ["jklu.edu.in"], onRoster: false }).status,
      "claimed",
      email,
    );
  }
  // A department subdomain of the college is still the college.
  assert.equal(
    membershipFor({ email: "a@cse.jklu.edu.in", emailVerified: true, domains: ["jklu.edu.in"], onRoster: false }).status,
    "verified",
  );
});

// ── College admin is read-only on student data ─────────────────────────

test("college admin may only run drives, roster and nudges", () => {
  for (const ok of ["drive:create", "drive:update", "drive:revoke", "roster:import", "nudge:send"]) {
    assert.equal(collegeAdminMay(ok), true, ok);
  }
  for (const no of [
    "student:update",
    "student:delete",
    "score:update",
    "offer:respond",
    "proposal:update",
    "membership:update",
    "recording:delete",
    "",
    "drive:create ",
  ]) {
    assert.equal(collegeAdminMay(no), false, no);
  }
});

test("college admin sees only their own college's consenting students", () => {
  const admin = { uid: "ca-1", role: "college" as const };
  const consented = { collegeId: "college-x", leftAt: null, purposes: allPurposes };
  assert.equal(canCollegeAdminSee(admin, "college-x", consented), true);
  assert.equal(canCollegeAdminSee(admin, "college-y", consented), false);
  assert.equal(canCollegeAdminSee(admin, "college-x", { ...consented, collegeId: "college-y" }), false);
  assert.equal(canCollegeAdminSee(admin, "college-x", { ...consented, leftAt: new Date() }), false);
  assert.equal(canCollegeAdminSee(admin, "college-x", { ...consented, purposes: ["drive_visibility"] }), false);
  assert.equal(canCollegeAdminSee({ uid: "e", role: "employer" }, "college-x", consented), false);
  assert.equal(canCollegeAdminSee(admin, "", consented), false);
});

test("a college session is a valid session but never an admin, and owns only itself", () => {
  const { cookie } = createSession({ uid: "ca-1", role: "college", email: "tpo@jklu.edu.in", secure: false });
  const s = readSession(cookie.split(";")[0].slice("ft_sid=".length));
  assert.equal(s?.role, "college");
  assert.equal(canAccess(s!, "ca-1"), true);
  assert.equal(canAccess(s!, "stu-1"), false);
});

test("a college session cannot carry an impersonator or permissions", () => {
  const { cookie } = createSession({
    uid: "ca-1",
    role: "college",
    email: "tpo@jklu.edu.in",
    permissions: ["*"],
    secure: false,
  });
  assert.equal(readSession(cookie.split(";")[0].slice("ft_sid=".length)), null);
});
