import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PUBLIC_ORIGIN = "http://localhost:3000";

const { inviteSig, inviteSigOk, invitePath, newInvitees, isInvited, driveInviteEmail } = await import("./drive-invite.ts");
const { inviteSentLine } = await import("./drive-invite-line.ts");
const { checkDriveInviteLink } = await import("./access.ts");
const { driveInput } = await import("./drive-input.ts");
const { safeNext } = await import("../google.ts");
const { renderEmail } = await import("../emails.ts");

const SECRET = "s".repeat(40);
const DRIVE = "11111111-2222-3333-4444-555555555555";
const HASH = "a".repeat(64);

test("an invite signature is bound to the drive, its current link and the email", () => {
  const sig = inviteSig(SECRET, DRIVE, HASH, "hr@acme.com");
  assert.match(sig, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(inviteSigOk(SECRET, DRIVE, HASH, "hr@acme.com", sig), true);
  // The email is compared without case or stray spaces: it is the same address.
  assert.equal(inviteSigOk(SECRET, DRIVE, HASH, " HR@Acme.com ", sig), true);
  assert.equal(inviteSigOk(SECRET, DRIVE, HASH, "other@acme.com", sig), false);
  assert.equal(inviteSigOk(SECRET, "11111111-2222-3333-4444-555555555556", HASH, "hr@acme.com", sig), false);
  // Issuing a new drive link changes the hash and so kills every invite sent before it.
  assert.equal(inviteSigOk(SECRET, DRIVE, "b".repeat(64), "hr@acme.com", sig), false);
  assert.equal(inviteSigOk("t".repeat(40), DRIVE, HASH, "hr@acme.com", sig), false);
  for (const bad of ["", "x", sig.slice(1), `${sig}A`, null, undefined]) assert.equal(inviteSigOk(SECRET, DRIVE, HASH, "hr@acme.com", bad), false);
});

test("the invite path is a same-origin path that survives the sign-in and sign-up return-to", () => {
  const path = invitePath(DRIVE, "hr+x@acme.com", "SIG_-abc");
  assert.equal(path, `/drive/invite/${DRIVE}?e=hr%2Bx%40acme.com&s=SIG_-abc`);
  assert.equal(safeNext(path, "/fallback"), path);
});

test("only addresses that were not already invited get a new invite", () => {
  const before = [{ company: "Acme", email: "hr@acme.com" }];
  const after = [
    { company: "Acme", email: "HR@acme.com" },
    { company: "Beta", email: "jobs@beta.io" },
    { company: "Beta again", email: "jobs@beta.io" },
  ];
  assert.deepEqual(newInvitees(before, after), [{ company: "Beta", email: "jobs@beta.io" }]);
  assert.deepEqual(newInvitees(undefined, after).map((i) => i.email), ["hr@acme.com", "jobs@beta.io"]);
  assert.deepEqual(newInvitees(before, undefined), []);
  assert.equal(isInvited(after, " JOBS@beta.io "), true);
  assert.equal(isInvited(before, "jobs@beta.io"), false);
});

test("the officer's confirmation names the address", () => {
  assert.equal(inviteSentLine(["hr@acme.com"], []), "Invite sent to hr@acme.com");
  assert.equal(inviteSentLine(["a@x.com", "b@y.com"], []), "Invites sent to a@x.com, b@y.com");
  assert.equal(inviteSentLine([], []), null);
  assert.equal(inviteSentLine(["a@x.com"], ["b@y.com"]), "Invite sent to a@x.com. Couldn't email b@y.com: send them the drive link yourself.");
  assert.equal(inviteSentLine([], ["b@y.com"]), "Couldn't email b@y.com: send them the drive link yourself.");
});

test("the invite email links to the drive join page and carries no raw drive token", () => {
  const path = invitePath(DRIVE, "hr@acme.com", "SIG");
  const c = driveInviteEmail({ company: "Acme", collegeName: "JKLU", driveTitle: "Summer 2027", kind: "internship", startsAt: new Date("2026-11-20T04:00:00Z"), endsAt: new Date("2026-11-27T04:00:00Z"), path });
  assert.equal(c.cta?.url, `http://localhost:3000${path}`);
  assert.match(c.subject, /JKLU/);
  const { text, html } = renderEmail(c);
  assert.match(text, /Summer 2027/);
  assert.match(text, /Acme/);
  assert.match(html, /JKLU/);
  assert.doesNotMatch(c.reason ?? "", /you have a Findtern account/);
});

test("the invite email escapes a hostile company name", () => {
  const c = driveInviteEmail({ company: "<img src=x onerror=alert(1)>", collegeName: "JKLU", driveTitle: "T", kind: "full_time", startsAt: new Date(0), endsAt: new Date(1e10), path: "/drive/invite/x?e=a&s=b" });
  assert.doesNotMatch(renderEmail(c).html, /<img src=x/);
});

const drive = { collegeId: "c", startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 3600_000), revokedAt: null, tokenHash: HASH, eligibility: {}, includeUserIds: [], excludeUserIds: [] };

test("an invite admits a signed-in employer into a live drive only", () => {
  const emp = { uid: "e1", role: "employer" as const };
  assert.deepEqual(checkDriveInviteLink({ drive, valid: true, session: emp, collegeActive: true }), { ok: true });
  assert.deepEqual(checkDriveInviteLink({ drive, valid: false, session: emp, collegeActive: true }), { ok: false, reason: "bad_token" });
  assert.deepEqual(checkDriveInviteLink({ drive, valid: true, session: null, collegeActive: true }), { ok: false, reason: "sign_in" });
  assert.deepEqual(checkDriveInviteLink({ drive, valid: true, session: { uid: "i", role: "intern" }, collegeActive: true }), { ok: false, reason: "not_employer" });
  assert.deepEqual(checkDriveInviteLink({ drive, valid: true, session: emp, collegeActive: false }), { ok: false, reason: "revoked" });
  assert.deepEqual(checkDriveInviteLink({ drive: { ...drive, revokedAt: new Date(Date.now() - 1000) }, valid: true, session: emp, collegeActive: true }), { ok: false, reason: "revoked" });
  assert.deepEqual(checkDriveInviteLink({ drive: { ...drive, endsAt: new Date(Date.now() - 1000) }, valid: true, session: emp, collegeActive: true }), { ok: false, reason: "ended" });
});

test("a drive may open on a day that has already started (past start is accepted)", () => {
  const base = { title: "Backfilled drive", kind: "internship", startsAt: "2020-01-01T00:00:00.000Z", endsAt: "2020-01-08T00:00:00.000Z" };
  assert.equal(driveInput.safeParse(base).success, true);
  const yesterday = new Date(Date.now() - 86_400_000);
  const r = driveInput.safeParse({ ...base, startsAt: yesterday.toISOString(), endsAt: new Date(Date.now() + 6 * 86_400_000).toISOString() });
  assert.equal(r.success, true);
  // The end must still come after the start.
  const bad = driveInput.safeParse({ ...base, endsAt: base.startsAt });
  assert.equal(bad.success, false);
});
