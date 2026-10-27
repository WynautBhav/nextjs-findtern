/**
 * Promo code and discount for one payment row, whichever app wrote it.
 *
 * The two apps share the database and store the same fact in four places:
 *  - new app, intern fee:        raw.promoCode, raw.discountMinor
 *  - new app, employer order:    raw.promo.{promoCode, discountMinor} (or flat)
 *  - legacy, Razorpay order:     raw.order.notes.{promoCode, discountAmountMinor}
 *                                (or raw.notes.* on older rows)
 *  - legacy, free (100%) code:   raw.{promoCode, discountAmountMinor, originalAmountMinor}
 * and for interns marked paid by the profile flag only, the onboarding row's
 * extraData.payment.{promoCode, discountAmountMinor}.
 *
 * Reading only the first shape (what the admin did before) made every legacy
 * activation look promo-free (ADM-02).
 */

export type PaymentPromo = {
  code: string | null;
  /** Discount in the payment's minor units; 0 when none is recorded. */
  discountMinor: number;
};

type Bag = Record<string, unknown>;

const bag = (v: unknown): Bag => (v && typeof v === "object" && !Array.isArray(v) ? (v as Bag) : {});

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function minor(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * @param raw the payment's `raw` jsonb
 * @param fallback the onboarding `extraData.payment` (interns), used when the
 *   payment row itself carries nothing
 * @param amountMinor what was actually charged, to derive a discount from a
 *   stored original price when no discount figure was written
 */
export function paymentPromo(raw: unknown, fallback?: unknown, amountMinor?: number): PaymentPromo {
  const r = bag(raw);
  const promo = bag(r.promo);
  const order = bag(r.order);
  const notes = Object.keys(bag(order.notes)).length ? bag(order.notes) : bag(r.notes);
  const fb = bag(fallback);

  const code =
    text(promo.promoCode) ??
    text(promo.code) ??
    text(r.promoCode) ??
    text(r.promo_code) ??
    text(notes.promoCode) ??
    text(notes.promo_code) ??
    text(fb.promoCode) ??
    text(fb.promo_code);

  let discount =
    minor(promo.discountMinor) ??
    minor(r.discountMinor) ??
    minor(r.discountAmountMinor) ??
    minor(notes.discountAmountMinor) ??
    minor(notes.discountMinor) ??
    minor(fb.discountAmountMinor) ??
    minor(fb.discountMinor);

  if (discount == null && amountMinor != null) {
    const original = minor(r.originalAmountMinor) ?? minor(notes.originalAmountMinor) ?? minor(fb.originalAmountMinor);
    if (original != null && original > amountMinor) discount = original - amountMinor;
  }

  return { code, discountMinor: discount ?? 0 };
}

/**
 * The line an invoice prints for a discount. Legacy employer invoices said
 * "Discount (10%)" for the upfront-payment discount, which has no code; a
 * coded discount names the code.
 */
export function discountLabel(promo: PaymentPromo, amountMinor: number): string | null {
  if (promo.code) return promo.code;
  if (promo.discountMinor <= 0) return null;
  const before = amountMinor + promo.discountMinor;
  const pct = before > 0 ? Math.round((promo.discountMinor / before) * 100) : 0;
  return pct > 0 ? `Discount (${pct}%)` : "Discount";
}
