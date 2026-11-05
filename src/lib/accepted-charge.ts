import { lineCharge, type LineCharge, type PayMode } from "./checkout.ts";
import type { Offer } from "./offer.ts";

/**
 * The score an accepted offer is priced with. Only a 6+ intern gets an offer
 * on the monthly / post-paid plan, so by the time one is accepted the score
 * gate has been passed. A later score change or a cleared score must not
 * reprice it (a drop below 6 would set `monthlyBlocked` and price a due month
 * as the whole engagement). dues.ts, invoice-lines.ts and payment-reminders.ts
 * pass the same 10.
 */
export const ACCEPTED_OFFER_SCORE = 10;

/** `lineCharge` for an accepted offer, on the fixed basis above instead of the intern's live score. */
export function acceptedLineCharge(offer: Offer, mode: PayMode = "upfront", opts: { firstPayment?: boolean } = {}): LineCharge {
  return lineCharge(offer, ACCEPTED_OFFER_SCORE, mode, opts);
}
