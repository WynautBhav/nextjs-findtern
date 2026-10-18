"use client";

/**
 * Employer pay button.
 *
 * One button per currency total on the checkout page - a Razorpay order is
 * single-currency, and silently converting would bill the employer the wrong
 * amount, so mixed carts are paid as separate orders.
 *
 * Flow: create the order server-side (`POST .../payment/razorpay/order`,
 * which also writes the `created` employer_payments row), open the modal,
 * then verify the HMAC signature server-side before anything counts as paid.
 * The client never decides a price; it only carries ids between the two
 * server routes.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Tag } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import { loadRazorpay, RAZORPAY_THEME_COLOR } from "./razorpay-client";

type Props = {
  employerId: string;
  currency: "INR" | "USD";
  amountMinor: number;
  prefill: { name?: string; email?: string; contact?: string };
  /** Pay for these accepted proposals only. */
  proposalIds?: string[];
  mode?: "upfront" | "monthly";
};

export function CheckoutPay({ employerId, currency, amountMinor, prefill, proposalIds, mode = "upfront" }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "paid">("idle");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [promo, setPromo] = useState<{ code: string; discountMinor: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const payable = promo ? amountMinor - promo.discountMinor : amountMinor;

  async function applyCode() {
    if (!code.trim()) return;
    setChecking(true);
    setPromoError(null);
    setPromo(null);
    try {
      const res = await csrfFetch(
        `/api/employer/${encodeURIComponent(employerId)}/payment/validate-promo`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: code.trim(), currency, proposalIds, mode }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "That code did not work.");
      setPromo({ code: body.code, discountMinor: Number(body.discountMinor) || 0 });
    } catch (e) {
      setPromoError(e instanceof Error ? e.message : "That code did not work.");
    } finally {
      setChecking(false);
    }
  }

  async function pay() {
    setState("busy");
    setError(null);
    try {
      const [Razorpay, order] = await Promise.all([
        loadRazorpay(),
        csrfFetch(`/api/employer/${encodeURIComponent(employerId)}/payment/razorpay/order`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ currency, promoCode: promo?.code, proposalIds, mode }),
        }).then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? "Could not create the payment order.");
          return body as { orderId: string; amount: number; currency: string; keyId: string };
        }),
      ]);

      const rzp = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Findtern",
        description: `Internship payment (${order.currency})`,
        prefill,
        theme: { color: RAZORPAY_THEME_COLOR },
        modal: {
          ondismiss: () => {
            setState("idle");
            // Closed without paying: drop the open order so it isn't left dangling.
            void csrfFetch(`/api/employer/${encodeURIComponent(employerId)}/payment/cancel`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ orderId: order.orderId }),
            });
          },
        },
        handler: async (response) => {
          try {
            const res = await csrfFetch(
              `/api/employer/${encodeURIComponent(employerId)}/payment/razorpay/verify`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  orderId: response.razorpay_order_id,
                  paymentId: response.razorpay_payment_id,
                  signature: response.razorpay_signature,
                }),
              },
            );
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Payment could not be verified.");
            setState("paid");
            router.refresh();
          } catch (e) {
            setError(
              e instanceof Error
                ? `${e.message} If money was debited, it shows under Orders once the gateway confirms it.`
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
    return (
      <div className="rounded-[10px] border border-brand-200 bg-brand-50 p-4 text-sm leading-relaxed text-brand-800">
        Payment received. It is listed under{" "}
        <a href="/employer/orders" className="font-semibold underline underline-offset-4">
          Orders
        </a>
        .
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <label htmlFor={`promo-${currency}`} className="sr-only">
          Promo code
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              id={`promo-${currency}`}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (promo) setPromo(null);
              }}
              placeholder="Promo code"
              autoComplete="off"
              className="min-h-10 w-full rounded-[10px] border border-ink-200 bg-white pl-8 pr-3 text-sm uppercase text-ink-900 outline-none placeholder:normal-case placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
            />
          </div>
          <button
            type="button"
            onClick={applyCode}
            disabled={!code.trim() || checking || state === "busy"}
            className="min-h-10 rounded-[10px] border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
          >
            {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Apply"}
          </button>
        </div>
        {promoError ? (
          <p className="mt-1.5 text-xs text-danger" role="alert">
            {promoError}
          </p>
        ) : promo ? (
          <p className="mt-1.5 text-xs text-success">
            {promo.code} applied: {formatMoney(promo.discountMinor, currency)} off
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={pay}
        disabled={state === "busy"}
        className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-700 text-sm font-semibold tabular-nums text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "busy" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <CreditCard className="size-4" aria-hidden />
        )}
        Pay {formatMoney(payable, currency)}
        {promo ? (
          <span className="text-xs font-normal line-through opacity-70">
            {formatMoney(amountMinor, currency)}
          </span>
        ) : null}
      </button>
      {error ? (
        <p className="mt-2 text-pretty text-xs leading-relaxed text-danger">{error}</p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-text-subtle">
          Razorpay handles the card details; this site never sees them. The signature is verified
          server-side before the payment counts.
        </p>
      )}
    </div>
  );
}
