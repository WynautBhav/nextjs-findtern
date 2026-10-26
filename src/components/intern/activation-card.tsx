"use client";

/**
 * Intern activation - the ₹2,499 one-time payment that takes a profile live.
 *
 * The legacy dashboard owned this flow and it was the only intern-side
 * revenue in the product; the rewrite shipped API routes for it but no page
 * ever called them, so an intern had no way to pay. This card closes that.
 *
 * Price honesty: the client never computes the charge. The promo is *checked*
 * here only to preview the discount; the order route re-validates the code
 * and recomputes the amount server-side before creating the Razorpay order.
 * A 100% code short-circuits to a free `paid` row without opening the modal.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BadgeIndianRupee, CalendarCheck, Check, Loader2, Sparkles } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import { loadRazorpay, RAZORPAY_THEME_COLOR } from "@/components/payments/razorpay-client";

/** The server prices the discount (`validate-promo`); this is display only. */
type Promo = { code: string; discountMinor: number };

export function ActivationCard({
  internId,
  feeMinor,
  prefill,
  alreadyPaid = false,
  embedded = false,
  testMode = false,
}: {
  /** PAYMENTS_MODE=free: activation completes without Razorpay. */
  testMode?: boolean;
  internId: string;
  /** Admin-set activation fee (platform_settings), GST-inclusive. */
  feeMinor: number;
  prefill: { name?: string; email?: string; contact?: string };
  /** Set when a paid row already exists, so only the interview step is offered. */
  alreadyPaid?: boolean;
  /** Inside the Home checklist: no card chrome or heading, the step supplies both. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "paid">("idle");
  const [error, setError] = useState<string | null>(null);

  const discount = promo ? Math.min(promo.discountMinor, feeMinor) : 0;
  const payable = feeMinor - discount;

  async function applyCode() {
    if (!code.trim()) return;
    setChecking(true);
    setPromoError(null);
    setPromo(null);
    try {
      const res = await csrfFetch(
        `/api/intern/${encodeURIComponent(internId)}/payment/validate-promo`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: code.trim() }),
        },
      );
      const body = await res.json().catch(() => ({}));
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
    try {
      const orderRes = await csrfFetch(
        `/api/intern/${encodeURIComponent(internId)}/payment/razorpay/order`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(promo ? { promoCode: promo.code } : {}),
        },
      );
      const order = await orderRes.json().catch(() => ({}));
      // 409: the server already has this profile as paid (an earlier click,
      // another tab, or a webhook). That is the outcome we wanted, so show it
      // instead of an error under a form that still asks for payment.
      if (orderRes.status === 409) {
        setState("paid");
        router.refresh();
        return;
      }
      if (!orderRes.ok) throw new Error(order.error ?? "Could not create the payment order.");

      // Full-discount code: the server already wrote a paid row. No modal.
      if (order.free) {
        setState("paid");
        router.refresh();
        return;
      }

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
        modal: { ondismiss: () => setState("idle") },
        handler: async (response) => {
          try {
            const res = await csrfFetch(
              `/api/intern/${encodeURIComponent(internId)}/payment/razorpay/verify`,
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

  if ((state === "paid" || alreadyPaid) && embedded) {
    return (
      <div>
        <p className="text-sm leading-relaxed text-ink-600">
          {alreadyPaid ? "Activation is paid." : "Payment confirmed."} Request the interview and the
          link arrives in your notifications.
        </p>
        <AiInterviewButton internId={internId} />
      </div>
    );
  }

  if (state === "paid" || alreadyPaid) {
    if (alreadyPaid) {
      return (
        <section className="rounded-xl border border-brand-200 bg-brand-50 p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-900">
            <Check className="size-4" aria-hidden />
            Your profile is live
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-brand-800">
            Activation paid for. The AI interview produces the Findtern Score companies shortlist
            on.
          </p>
          <AiInterviewButton internId={internId} />
        </section>
      );
    }
    return (
      <section className="rounded-xl border border-brand-200 bg-brand-50 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-900">
          <Check className="size-4" aria-hidden />
          Your profile is live
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-brand-800">
          Payment confirmed. The AI interview is the next step - it produces the Findtern Score
          companies shortlist on.
        </p>
        <AiInterviewButton internId={internId} />
      </section>
    );
  }

  return (
    <section className={embedded ? "" : "rounded-xl border border-ink-100 bg-white p-6"}>
      {embedded ? (
        <p className="text-pretty text-sm leading-relaxed text-ink-600">
          One payment covers the AI interview and your Findtern Score. No subscription, nothing
          recurring.
        </p>
      ) : (
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-700">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
            Take your profile live
          </h2>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-600">
            One payment of {formatMoney(feeMinor, "INR")} covers the AI interview and your
            Findtern Score - the two things companies shortlist on. No subscription, nothing
            recurring.
          </p>
        </div>
      </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setPromo(null);
            setPromoError(null);
          }}
          placeholder="Promo code (optional)"
          autoComplete="off"
          className="apple-spring h-10 min-w-0 flex-1 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <button
          type="button"
          onClick={applyCode}
          disabled={checking || !code.trim()}
          className="apple-spring apple-pressable inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-ink-200 bg-white px-4 text-[14px] font-medium text-ink-800 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Apply
        </button>
      </div>

      {promoError ? (
        <p className="mt-2 text-xs text-danger">{promoError}</p>
      ) : null}

      {promo ? (
        <dl className="mt-3 space-y-1.5 rounded-[10px] bg-ink-50 p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="text-ink-600">Activation</dt>
            <dd className="tabular-nums text-ink-800">{formatMoney(feeMinor, "INR")}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-ink-600">Code {promo.code}</dt>
            <dd className="tabular-nums text-brand-700">−{formatMoney(discount, "INR")}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-ink-100 pt-1.5">
            <dt className="font-medium text-ink-900">You pay</dt>
            <dd className="font-semibold tabular-nums text-ink-900">
              {formatMoney(payable, "INR")}
            </dd>
          </div>
        </dl>
      ) : null}

      <button
        type="button"
        onClick={pay}
        disabled={state === "busy"}
        className="apple-spring apple-pressable mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-700 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "busy" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <BadgeIndianRupee className="size-4" aria-hidden />
        )}
        {testMode
          ? "Activate free (test mode)"
          : payable === 0
            ? "Activate free with code"
            : `Pay ${formatMoney(payable, "INR")} and go live`}
      </button>

      {error ? (
        <p className="mt-2 text-pretty text-xs leading-relaxed text-danger">{error}</p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-text-subtle">
          Razorpay handles the card details; this site never sees them. The amount is recomputed
          on the server, so a promo edited in the browser cannot change what you are charged.
        </p>
      )}
    </section>
  );
}


/**
 * Apply for the AI interview.
 *
 * One click, one POST. The queue is real and the link arrives in the candidate's
 * notifications, so the button reports the truth rather than pretending the
 * interview is scheduled - it is requested, not booked, and the copy says so.
 */
export function AiInterviewButton({ internId }: { internId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "busy" | "applied" | "in-flight">("idle");
  const [message, setMessage] = useState<string | null>(null);

  // An existing in-flight application should show as applied on load rather
  // than as a button that 409s.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await csrfFetch(`/api/intern/${encodeURIComponent(internId)}/ai-interview/apply`, {
          method: "GET",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (data.pending) {
          setStatus("in-flight");
          setMessage(data.message ?? "Your application is already in the queue.");
        }
      } catch {
        // A preflight that fails is not a reason to hide the button.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [internId]);

  async function apply() {
    setStatus("busy");
    setMessage(null);
    try {
      const res = await csrfFetch(`/api/intern/${encodeURIComponent(internId)}/ai-interview/apply`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setStatus("in-flight");
        setMessage("Your application is already in the queue.");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not register your application.");
      setStatus("applied");
      setMessage("You are in the queue. The link arrives here, usually within two working days.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not register your application.");
      setStatus("idle");
    }
  }

  if (status === "applied" || status === "in-flight") {
    return (
      <p className="mt-4 inline-flex items-start gap-2 rounded-[10px] bg-white/70 px-3.5 py-3 text-sm leading-relaxed text-brand-900">
        <CalendarCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {message}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={apply}
        disabled={status === "busy"}
        className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {status === "busy" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <CalendarCheck className="size-4" aria-hidden />
        )}
        Request my AI interview
      </button>
      {message ? <p className="mt-2 text-xs text-brand-800">{message}</p> : null}
    </div>
  );
}