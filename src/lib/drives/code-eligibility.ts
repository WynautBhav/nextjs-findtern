/**
 * SQL boolean: the student this sheet row was matched to cannot use the college's code, so nothing about it is sent
 * (no "your college paid, accept it", no code email). `$e` is the roster entry alias, `$college` an expression for the
 * order's college id. Unmatched rows (no intern_id) are never excluded: nothing is known about who they are.
 *   - the fee is already settled (the redeem route would answer 409 "already activated");
 *   - this college removed the student (college_denials: only a restore brings them back, and redeeming is refused);
 *   - the student is a live member of ANOTHER college (leaving needs that college's approval).
 */
export function codeUnusableSql(e: string, college: string): string {
  // The account this row stands for: the linked one, else (WP4: a denied / other-college / left student is NOT linked by a
  // confirm) the intern whose VERIFIED email is the row's email. Without this the unlinked rows would all be mailed.
  const who = `coalesce(${e}.intern_id, (SELECT u.id FROM users u WHERE u.role = 'intern' AND u.email_verified AND u.email = ${e}.college_email_norm LIMIT 1))`;
  return `(${who} IS NOT NULL AND (
    EXISTS (SELECT 1 FROM intern_payments pay WHERE pay.intern_id = ${who} AND pay.status = 'paid')
    OR EXISTS (SELECT 1 FROM intern_onboarding ob WHERE ob.user_id = ${who} AND coalesce(ob.extra_data->'payment'->>'isPaid', '') = 'true')
    OR EXISTS (SELECT 1 FROM college_denials d WHERE d.college_id = ${college} AND d.user_id = ${who})
    OR EXISTS (SELECT 1 FROM college_memberships mem WHERE mem.user_id = ${who} AND mem.left_at IS NULL AND mem.college_id <> ${college})))`;
}
