import { verifyOtp } from "./security/rate-limit.ts";

export type OtpVerdict = "ok" | "invalid" | "locked";

/**
 * What verify-otp answers for the newest unused code row. A row that is expired, or the stand-in send-otp writes for an
 * already-registered address (expired from birth, its hash matches no code), takes the SAME wrong-guess path as a live
 * row, so the 5th wrong code is a 429 whether or not the address has an account (B-55). `takeGuess` is `limiters.otpGuess.take`.
 */
export function otpVerdict(
  row: { id: string; otpHash: string; expiresAt: Date } | undefined,
  otp: string,
  email: string,
  takeGuess: (rowId: string) => boolean,
  now: Date = new Date(),
): OtpVerdict {
  if (!row) return "invalid";
  if (!verifyOtp(otp, email, row.otpHash)) return takeGuess(row.id) ? "invalid" : "locked";
  return row.expiresAt < now ? "invalid" : "ok";
}
