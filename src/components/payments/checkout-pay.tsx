"use client";

/**
 * Employer pay button.
 *
 * One button per currency total on the checkout page — a Razorpay order is
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
import { CreditCard, Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import { loadRazorpay, RAZORPAY_THEME_COLOR } from "./razorpay-client";

type Props = {
  employerId: string;
  currency: "INR" | "USD";
  amountMinor: number;
  prefill: { name?: string; email?: string; contact?: string };
};

export function CheckoutPay({ employerId, currency, amountMinor, prefill }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "paid">("idle");
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setState("busy");
    setError(null);
    try {
      const [Razorpay, order] = await Promise.all([
        loadRazorpay(),
        csrfFetch(`/api/employer/${encodeURIComponent(employerId)}/payment/razorpay/order`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ currency }),
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
        modal: { ondismiss: () => setState("idle") },
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
      <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm leading-relaxed text-brand-800">
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
      <button
        type="button"
        onClick={pay}
        disabled={state === "busy"}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "busy" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <CreditCard className="size-4" aria-hidden />
        )}
        Pay {formatMoney(amountMinor, currency)}
      </button>
      {error ? (
        <p className="mt-2 text-pretty text-xs leading-relaxed text-danger">{error}</p>
      ) : (
        <p className="mt-2 text-2xs leading-relaxed text-text-subtle">
          Razorpay handles the card details; this site never sees them. The signature is verified
          server-side before the payment counts.
        </p>
      )}
    </div>
  );
}
