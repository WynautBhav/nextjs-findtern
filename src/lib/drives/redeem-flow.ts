import { withPgTransaction } from "@/lib/db/pg-tx";
import { promoConsentNotice } from "@/lib/college/promo-consent";
import { markInternPaidFlag } from "@/lib/payments";
import { notify } from "@/lib/notify";

import { driveCodeSecret } from "./code-derive";
import { redeemDriveCode } from "./redeem-db";

/**
 * Redeem a drive code for a student and tell them. The one path behind both "type your code" and "claim what
 * your college paid", so the waiver, the consent record and the notification can never differ between them.
 * Throws RedeemRefused when the code is not usable.
 */
export async function redeemForStudent(input: { uid: string; code: string; declaredAdult: boolean }) {
  const out = await withPgTransaction((client) =>
    redeemDriveCode(client, {
      code: input.code,
      internId: input.uid,
      secret: driveCodeSecret(),
      now: new Date(),
      consentNotice: promoConsentNotice("your college"),
      declaredAdult: input.declaredAdult,
    }),
  );
  await markInternPaidFlag(input.uid, { orderId: `drive:${out.codeId}`, paymentId: out.paymentId }).catch((e) => console.error("[drive-redeem] paid flag", e));
  await notify({
    to: { type: "intern", id: input.uid },
    type: "drive_code_redeemed",
    title: "Your college covers your fee",
    message: `${out.collegeName} has covered your AI interview fee.`,
    dedupeKey: `drive-redeem:${out.paymentId}`,
  }).catch((e) => console.error("[drive-redeem] notify", e));
  return out;
}
