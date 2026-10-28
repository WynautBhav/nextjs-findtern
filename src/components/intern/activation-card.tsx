"use client";

/**
 * Intern activation - the one-time payment that takes a profile live.
 *
 * Price honesty: the client never computes the charge. The promo is *checked*
 * here only to preview the discount; the order route re-validates the code
 * and recomputes the amount server-side before creating the Razorpay order.
 * A 100% code short-circuits to a free `paid` row without opening the modal.
 *
 * An already-activated profile never sees this form: the page decides with
 * `alreadyPaid`, and if the server says "already activated" at any step (an
 * earlier click, another tab, a webhook) the card switches to the paid state
 * and refreshes instead of printing an error under a form that still asks
 * for money (bug sheet 7, S1 r56).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeIndianRupee, Check, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { AiInterviewAction } from "@/components/intern/ai-interview-join-card";
import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import { loadRazorpay, RAZORPAY_THEME_COLOR } from "@/components/payments/razorpay-client";

/** The server prices the discount (`validate-promo`); this is display only. */
type Promo = { code: string; discountMinor: number };

const fieldClass =
  "h-11 min-w-0 flex-1 rounded-apple-sm border border-ink-200 bg-white px-3.5 text-[0.9375rem] text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function ActivationCard({
  internId,
  feeMinor,
  prefill,
  alreadyPaid = false,
  testMode = false,
}: {
  /** PAYMENTS_MODE=free: activation completes without Razorpay. */
  testMode?: boolean;
  internId: string;
  /** Admin-set activation fee (platform_settings), GST-inclusive. */
  feeMinor: number;
  prefill: { name?: string; email?: string; contact?: string };
  /** Set when a paid row already exists: the form is never shown. */
  alreadyPaid?: boolean;
  /** Kept for callers; the card is always rendered inside a step now. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "paid">(alreadyPaid ? "paid" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const discount = promo ? Math.min(promo.discountMinor, feeMinor) : 0;
  const payable = feeMinor - discount;

  function markPaid() {
    setState("paid");
    router.refresh();
  }

  async function applyCode() {
    if (!code.trim()) return;
    setChecking(true);
    setPromoError(null);
    setPromo(null);
    try {
      const res = await csrfFetch(`/api/intern/${encodeURIComponent(internId)}/payment/validate-promo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.alreadyPaid) return markPaid();
      if (!res.ok) throw new Error(body.error ?? "That code did not work.");
      setPromo({ code: code.trim().toUpperCase(), discountMinor: Number(body.discountMinor) || 0 });
    } catch (e) {
      setPromoError(e instanceof Error ? e.message : "That code did not work.");
    } finally {
      setChecking(false);
    }
  }

  async function pay() {
    setState("busy");
    setError(null);
    setNotice(null);
    try {
      const orderRes = await csrfFetch(`/api/intern/${encodeURIComponent(internId)}/payment/razorpay/order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(promo ? { promoCode: promo.code } : {}),
      });
      const order = await orderRes.json().catch(() => ({}));
      // 409: the server already has this profile as paid. That is the
      // outcome we wanted, so show it instead of an error.
      if (orderRes.status === 409) return markPaid();
      if (!orderRes.ok) throw new Error(order.error ?? "Could not create the payment order.");

      // Full-discount code or test mode: the server already wrote a paid row.
      if (order.free) return markPaid();

      const Razorpay = await loadRazorpay();
      const rzp = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Findtern",
        description: "Profile activation - AI interview and Findtern Score",
        prefill,
        theme: { color: RAZORPAY_THEME_COLOR },
        modal: {
          // Legacy said so when the checkout was closed (INT-31).
          ondismiss: () => {
            setState("idle");
            setNotice("Payment cancelled. Nothing was charged; you can try again whenever you are ready.");
          },
        },
        handler: async (response) => {
          try {
            const res = await csrfFetch(`/api/intern/${encodeURIComponent(internId)}/payment/razorpay/verify`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Payment could not be verified.");
            markPaid();
          } catch (e) {
            setError(
              e instanceof Error
                ? `${e.message} If money was debited, it settles automatically once the gateway confirms it.`
                : "Payment could not be verified.",
            );
            setState("idle");
          }
        },
      });

      rzp.on("payment.failed", (response) => {
        setError(response.error.description || "The payment failed. No money was taken.");
        setState("idle");
      });

      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong starting the payment.");
      setState("idle");
    }
  }

  if (state === "paid") {
    // The page refreshes into "Paid" with the interview step opened below.
    return (
      <p role="status" className="flex items-center gap-2 text-sm font-medium text-brand-800">
        <Check className="size-4" aria-hidden />
        Activation paid. Nothing else is ever charged to you.
      </p>
    );
  }

  return (
    <div>
      <p className="text-pretty text-sm leading-relaxed text-ink-600">
        One payment covers the AI interview and your Findtern Score. No subscription, nothing recurring.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="activation-promo" className="sr-only">
          Promo code
        </label>
        <input
          id="activation-promo"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setPromo(null);
            setPromoError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void applyCode();
            }
          }}
          placeholder="Promo code (optional)"
          autoComplete="off"
          className={fieldClass}
        />
        <button
          type="button"
          onClick={applyCode}
          disabled={checking || !code.trim()}
          className={buttonClass({ variant: "outline", className: "shrink-0" })}
        >
          {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Apply
        </button>
      </div>

      {promoError ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {promoError}
        </p>
      ) : null}

      {promo ? (
        <dl className="mt-3 space-y-2 rounded-apple-md bg-ink-50 p-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-600">Activation</dt>
            <dd className="nums text-ink-800">{formatMoney(feeMinor, "INR")}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-600">Code {promo.code}</dt>
            <dd className="nums text-brand-700">−{formatMoney(discount, "INR")}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-ink-200/80 pt-2">
            <dt className="font-medium text-ink-900">You pay</dt>
            <dd className="nums font-semibold text-ink-900">{formatMoney(payable, "INR")}</dd>
          </div>
        </dl>
      ) : null}

      <button
        type="button"
        onClick={pay}
        disabled={state === "busy"}
        className={buttonClass({ variant: "primary", block: true, className: "mt-4" })}
      >
        {state === "busy" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BadgeIndianRupee className="size-4" aria-hidden />}
        {testMode
          ? "Activate free (test mode)"
          : payable === 0
            ? "Activate free with code"
            : `Pay ${formatMoney(payable, "INR")} and go live`}
      </button>

      {error ? (
        <p role="alert" className="mt-2 text-pretty text-sm leading-relaxed text-danger">
          {error}
        </p>
      ) : notice ? (
        <p role="status" className="mt-2 text-pretty text-sm leading-relaxed text-ink-700">
          {notice}
        </p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-ink-600">
          Razorpay handles the card details; this site never sees them. The amount is recomputed on the server.
        </p>
      )}
    </div>
  );
}

/** For screens that only know the candidate: reads the phase itself. */
export function AiInterviewButton({ internId }: { internId: string }) {
  return <AiInterviewAction internId={internId} initialPhase="apply" initialLink={null} sync />;
}
