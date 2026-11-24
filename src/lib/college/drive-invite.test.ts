import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PUBLIC_ORIGIN = "http://localhost:3000";

const { inviteSig, inviteSigOk, invitePath, invitesToSend, withUnsent, canSendInvites, isInvited, driveInviteEmail, inviteeAddProblem } = await import("./drive-invite.ts");
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

test("only addresses that were not already invited, or never reached, get an invite", () => {
  const before = [{ company: "Acme", email: "hr@acme.com" }];
  const after = [
    { company: "Acme", email: "HR@acme.com" },
    { company: "Beta", email: "jobs@beta.io" },
    { company: "Beta again", email: "jobs@beta.io" },
  ];
  assert.deepEqual(invitesToSend(before, after), [{ company: "Beta", email: "jobs@beta.io" }]);
  assert.deepEqual(invitesToSend(undefined, after).map((i) => i.email), ["hr@acme.com", "jobs@beta.io"]);
  assert.deepEqual(invitesToSend(before, undefined), []);
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

const { InviteGate, INVITES_PER_COLLEGE_PER_DAY } = await import("./drive-invite-limit.ts");
const people = (n: number, tag = "a") => Array.from({ length: n }, (_, i) => ({ company: `C${i}`, email: `${tag}${i}@x.com` }));

test("a college can send at most 50 invite mails a day; the rest are held back, not lost", () => {
  assert.equal(INVITES_PER_COLLEGE_PER_DAY, 50);
  const gate = new InviteGate();
  const t = 1_000_000;
  const first = gate.plan("college-1", "drive-1", people(40), t);
  assert.equal(first.send.length, 40);
  const second = gate.plan("college-1", "drive-2", people(20, "b"), t + 1000);
  assert.equal(second.send.length, 10);
  assert.equal(second.limited.length, 10);
  // Another college has its own allowance.
  assert.equal(gate.plan("college-2", "drive-3", people(5, "c"), t).send.length, 5);
  // A day later the allowance is back.
  assert.equal(gate.plan("college-1", "drive-4", people(3, "d"), t + 24 * 3600_000 + 1).send.length, 3);
});

test("the same address is never re-invited to the same drive within 24 hours", () => {
  const gate = new InviteGate();
  const t = 5_000_000;
  const one = [{ company: "Acme", email: "hr@acme.com" }];
  assert.equal(gate.plan("c", "d1", one, t).send.length, 1);
  // Removed and added again an hour later: no second mail, and it does not eat the allowance or read as "limit reached".
  const again = gate.plan("c", "d1", [{ company: "Acme", email: "HR@acme.com" }], t + 3600_000);
  assert.deepEqual([again.send.length, again.limited.length], [0, 0]);
  // A different drive is a different invite.
  assert.equal(gate.plan("c", "d2", one, t + 3600_000).send.length, 1);
  // After 24 hours it may be sent again.
  assert.equal(gate.plan("c", "d1", one, t + 24 * 3600_000 + 1).send.length, 1);
});

test("the officer is told when the daily limit held invites back", () => {
  assert.equal(inviteSentLine(["a@x.com"], [], ["b@y.com"]), "Invite sent to a@x.com. Invite limit reached; try again tomorrow.");
  assert.equal(inviteSentLine([], [], ["b@y.com"]), "Invite limit reached; try again tomorrow.");
  assert.equal(inviteSentLine([], [], []), null);
});

test("the invite email does not promise the link is exclusive to the company", () => {
  const c = driveInviteEmail({ company: "Acme", collegeName: "JKLU", driveTitle: "T", kind: "internship", startsAt: new Date(0), endsAt: new Date(1e10), path: "/drive/invite/x?e=a&s=b" });
  assert.doesNotMatch(c.reason ?? "", /only|don't forward|do not forward/i);
  assert.match(c.reason ?? "", /placement office/);
});

test("a company the invite never reached is retried on the next save; one that was reached is not", () => {
  const stored = [
    { company: "Acme", email: "hr@acme.com" },
    { company: "Held", email: "held@x.io", unsent: true as const },
    { company: "Gone", email: "gone@x.io", unsent: true as const },
  ];
  // The officer re-saves the same list (the browser sends no `unsent`), minus Gone.
  const resaved = [
    { company: "Acme", email: "HR@acme.com" },
    { company: "Held", email: "held@x.io" },
  ];
  assert.deepEqual(invitesToSend(stored, resaved).map((i) => i.email), ["held@x.io"]);
  assert.deepEqual(invitesToSend(stored, resaved).map((i) => "unsent" in i), [false]);
});

test("the saved list flags exactly the addresses with no successful send", () => {
  const list = [
    { company: "A", email: "a@x.io", unsent: true as const },
    { company: "B", email: "b@x.io" },
    { company: "C", email: "c@x.io" },
  ];
  assert.deepEqual(withUnsent(list, ["B@x.io"]), [
    { company: "A", email: "a@x.io" },
    { company: "B", email: "b@x.io", unsent: true },
    { company: "C", email: "c@x.io" },
  ]);
  assert.deepEqual(withUnsent(list, []), [{ company: "A", email: "a@x.io" }, { company: "B", email: "b@x.io" }, { company: "C", email: "c@x.io" }]);
});

test("no invite is sent for a drive that has already ended", () => {
  const now = Date.now();
  assert.equal(canSendInvites({ startsAt: new Date(now - 7 * 864e5), endsAt: new Date(now - 1000), revokedAt: null }, now), false);
  assert.equal(canSendInvites({ startsAt: new Date(now - 1000), endsAt: new Date(now + 1000), revokedAt: null }, now), true);
  assert.equal(canSendInvites({ startsAt: new Date(now + 864e5), endsAt: new Date(now + 2 * 864e5), revokedAt: null }, now), true);
});

test("the same company typed twice (any case) is stored once", () => {
  const r = driveInput.parse({
    title: "Dedupe drive",
    kind: "internship",
    startsAt: "2026-11-01T00:00:00Z",
    endsAt: "2026-11-08T00:00:00Z",
    invitedEmployers: [
      { company: "Acme", email: "HR@Acme.com" },
      { company: "Acme again", email: "hr@acme.com " },
      { company: "Beta", email: "jobs@beta.io" },
    ],
  });
  assert.deepEqual(r.invitedEmployers, [
    { company: "Acme", email: "hr@acme.com" },
    { company: "Beta", email: "jobs@beta.io" },
  ]);
});

test("a failed send can be tried again the same day (forget), and a reissue can re-mail everyone", () => {
  const gate = new InviteGate();
  const t = 9_000_000;
  const one = [{ company: "Acme", email: "hr@acme.com" }];
  assert.equal(gate.plan("c", "d1", one, t).send.length, 1);
  assert.equal(gate.plan("c", "d1", one, t + 1).send.length, 0);
  gate.forget("d1", ["HR@acme.com"]);
  assert.equal(gate.plan("c", "d1", one, t + 2).send.length, 1);
});

test("adding one company: refused when that email is already invited (any case) or the drive has 50, else allowed", () => {
  const list = [{ company: "Acme", email: "hr@acme.com" }];
  assert.equal(inviteeAddProblem(list, " HR@Acme.com "), "This company is already invited.");
  assert.equal(inviteeAddProblem(list, "jobs@beta.in"), null);
  const full = Array.from({ length: 50 }, (_, i) => ({ company: `C${i}`, email: `c${i}@x.com` }));
  assert.equal(inviteeAddProblem(full, "new@x.com"), "A drive can invite at most 50 companies.");
  assert.equal(inviteeAddProblem(null, "new@x.com"), null);
});
