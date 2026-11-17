/** Pure shaping for the Overview tab: cohort conversion, signup vs paid, acquisition. */

export type Step = { label: string; count: number };

const pct = (n: number, d: number) => (d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0);

/**
 * "Of the people who signed up in this period, how many did each thing". Each step is counted on its own
 * against the first (the signups), in the order the owner reads it; they are not nested, so Paid activation
 * can be bigger than Hired. An empty cohort is 0%, never NaN.
 */
export function conversionRows(steps: readonly Step[]): (Step & { pct: number })[] {
  const base = steps[0]?.count ?? 0;
  return steps.map((s) => ({ ...s, pct: pct(s.count, base) }));
}

/** Signed up vs paid. `paidInWindow`: payers whose payment fell in the window (any signup date); `signedUpAndPaid`: of the window's signups, those who have paid. */
export function signupVsPaid(i: { signups: number; paidInWindow: number; signedUpAndPaid: number }) {
  return { ...i, signupToPaidPct: i.signups > 0 ? pct(i.signedUpAndPaid, i.signups) : null };
}

export type Share = { label: string; count: number };

/**
 * Where the period's new interns came from, from what the database holds: a college they belong to, a promo
 * code they used; everyone else is "Direct" (no source is recorded for them). There is no UTM or referral column.
 */
export function acquisitionRows(signups: number, src: { college: Share[]; promo: Share[] }) {
  const withPct = (rows: Share[]) => rows.map((r) => ({ ...r, pct: pct(r.count, signups) }));
  const collegeTotal = src.college.reduce((s, r) => s + r.count, 0);
  const promoTotal = src.promo.reduce((s, r) => s + r.count, 0);
  return {
    college: withPct(src.college),
    promo: withPct(src.promo),
    collegeTotal,
    promoTotal,
    direct: Math.max(0, signups - collegeTotal),
  };
}
