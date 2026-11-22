/**
 * The legacy "fee paid" flag on an intern's onboarding `extra_data`: boolean true or the string "true". Same rule as
 * `isInternPaid` (payments.ts) and `feePaidSql` (fee-paid-sql.ts), whose SQL `->>` reads both as 'true'. Admin screens that
 * already know the paid-row half use this for the flag half, so an intern the app unlocked is never shown unpaid. Pure.
 */
export function legacyFeeFlag(extraData: unknown): boolean {
  const payment = extraData && typeof extraData === "object" ? (extraData as { payment?: unknown }).payment : null;
  const flag = payment && typeof payment === "object" ? (payment as { isPaid?: unknown }).isPaid : null;
  return flag === true || flag === "true";
}
