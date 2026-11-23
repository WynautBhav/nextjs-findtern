// PM-01: a college-account intern (accountType 'college', set by joining with a code) can accept an offer; a claimed one still cannot.
// Runs against a findtern_ca_* scratch DB and a server on 333x. Changes it makes (accepted offers) are scratch-only; the
// membership / accountType edits it makes to stage each case are put back.
import { check, finish, one, q, session } from "./wp3-lib.mjs";

const PW = process.env.INTERN_PW ?? "Findtern@2026";
const cands = await q(
  `SELECT p.id AS pid, p.intern_id, u.email, m.verified_by, o.extra_data->>'accountType' AS acct
   FROM proposals p JOIN users u ON u.id = p.intern_id
   JOIN college_memberships m ON m.user_id = u.id AND m.left_at IS NULL
   JOIN intern_onboarding o ON o.user_id = u.id
   WHERE p.status = 'sent' AND NOT (p.offer_details ? 'fullTimeOffer') AND p.offer_details->>'startDate' > to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AND o.extra_data ? 'profileSubmittedAt' AND u.is_active AND u.frozen_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM proposals x WHERE x.intern_id = p.intern_id AND x.id <> p.id AND x.status IN ('sent','accepted','processing','hired'))
   ORDER BY p.id LIMIT 3`,
);
if (cands.length < 3) throw new Error("need 3 students with one sent offer each");
const [control, verified, claimed] = cands;
const accept = async (c) => (await (await session("intern", c.email, PW)).patch(`/api/proposals/${c.pid}/status`, { status: "accepted", agreedToTerms: true }));
const setAcct = (id, t) => q(`UPDATE intern_onboarding SET extra_data = extra_data || jsonb_build_object('accountType', $2::text) WHERE user_id = $1`, [id, t]);
const setBy = (id, by) => q(`UPDATE college_memberships SET verified_by = $2 WHERE user_id = $1`, [id, by]);
const restore = async (c) => {
  if (c.acct) await setAcct(c.intern_id, c.acct); else await q(`UPDATE intern_onboarding SET extra_data = extra_data - 'accountType' WHERE user_id = $1`, [c.intern_id]);
  await setBy(c.intern_id, c.verified_by);
};
try {
  // Control: a seeded student (no accountType), exactly as before.
  const r0 = await accept(control);
  check("PM01.1", `seeded student with no account type accepts (${r0.status})`, r0.status === 200, JSON.stringify(r0.json));
  // The state joining by a college code leaves: accountType 'college' + a code-verified membership.
  await setAcct(verified.intern_id, "college"); await setBy(verified.intern_id, "college_code");
  const r1 = await accept(verified);
  check("PM01.2", `college-account student backed by a college code accepts (${r1.status})`, r1.status === 200, JSON.stringify(r1.json));
  // A claimed membership (college email only) cannot back a college account: still refused, on the student's own screen only.
  await setAcct(claimed.intern_id, "college"); await setBy(claimed.intern_id, "email_domain");
  const r2 = await accept(claimed);
  check("PM01.3", `college-account student with only a claimed membership is refused 409 PROFILE_INCOMPLETE (${r2.status})`, r2.status === 409 && r2.json?.code === "PROFILE_INCOMPLETE" && r2.json?.missing?.includes("accountType"), JSON.stringify(r2.json));
  const st = await one(`SELECT status FROM proposals WHERE id = $1`, [claimed.pid]);
  check("PM01.4", "the refused offer stays sent", st.status === "sent", st.status);
} finally {
  for (const c of [verified, claimed]) await restore(c);
}
await finish();
