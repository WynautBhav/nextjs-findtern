"use client";

/**
 * Buy or renew Findtern Pro. The price, length and currency are fixed by the server; this form only carries a promo code and
 * asks the order route to price it (`preview`) or to open the order. Razorpay takes the card; the callback is verified
 * server-side before anything counts as paid. A full-waiver code completes without Razorpay. Every notice is in one polite
 * live region so a screen reader hears the result of Apply and of the payment.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Loader2, Tag } from "lucide-react";

import { SuccessMoment } from "@/components/app/success-moment";
import { fieldClass, labelClass } from "@/components/employer/ui-tokens";
import { buttonClass } from "@/components/ui/button";
import { loadRazorpay, RAZORPAY_THEME_COLOR } from "@/components/payments/razorpay-client";
import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";

type Props = {
  employerId: string;
  currency: "INR" | "USD";
  listMinor: number;
  durationDays: number;
  /** True when they hold access now: the button says Renew and the note says the days are added. */
  renewing: boolean;
  /** What buying does to the end date, said before the click. */
  note: string;
  prefill: { name?: string; email?: string; contact?: string };
};

type Applied = { code: string; discountMinor: number; payableMinor: number; fullWaiver: boolean };
type Notice = { kind: "ok" | "error" | "info"; text: string } | null;

// fetch rejects with a TypeError ("Failed to fetch") when offline; never show that raw.
function errorText(e: unknown, fallback: string): string {
  if (e instanceof TypeError) return "Couldn't reach the server. Check your connection and try again.";
  return e instanceof Error && e.message ? e.message : fallback;
}

export function SubscriptionBuy({ employerId, currency, listMinor, durationDays, renewing, note, prefill }: Props) {
  const router = useRouter();
  const base = `/api/employer/${encodeURIComponent(employerId)}`;
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Set once a purchase has gone through: the form gives way to the one celebratory moment.
  const [success, setSuccess] = useState<string | null>(null);
  // A second click in the same tick, before `busy` has re-rendered, must not start a second payment.
  const inFlight = useRef(false);

  const payable = applied ? applied.payableMinor : listMinor;
  const waived = Boolean(applied?.fullWaiver);

  async function apply() {
    const typed = code.trim();
    if (!typed || checking) return;
    setChecking(true);
    setApplied(null);
    setNotice(null);
    try {
      const res = await csrfFetch(`${base}/subscription/order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promoCode: typed, preview: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "That code did not work.");
      const next: Applied = { code: String(body.code), discountMinor: Number(body.discountMinor) || 0, payableMinor: Number(body.payableMinor) || 0, fullWaiver: body.fullWaiver === true };
      setApplied(next);
      setNotice({ kind: "ok", text: next.fullWaiver ? `${next.code} applied: Findtern Pro is free with this code.` : `${next.code} applied: ${formatMoney(next.discountMinor, currency)} off.` });
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e, "That code did not work. Try again.") });
    } finally {
      setChecking(false);
    }
  }

  function done(text: string) {
    setSuccess(text);
    setNotice({ kind: "ok", text });
    setApplied(null);
    setCode("");
    setBusy(false);
    router.refresh();
  }

  async function pay() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const res = await csrfFetch(`${base}/subscription/order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promoCode: applied?.code }),
      });
      const order = (await res.json().catch(() => ({}))) as { orderId?: string; amount?: number; currency?: string; keyId?: string; free?: boolean; waived?: boolean; error?: string };
      if (!res.ok) throw new Error(order.error ?? "Could not create the payment order.");
      // A full waiver, or a test host: the server already settled the order.
      if (order.free) return done(order.waived ? "Findtern Pro is on (complimentary, full waiver). The filters are unlocked on Candidates." : "Findtern Pro is on. The filters are unlocked on Candidates.");

      const Razorpay = await loadRazorpay();
      const rzp = new Razorpay({
        key: order.keyId!,
        order_id: order.orderId!,
        amount: order.amount!,
        currency: order.currency!,
        name: "Findtern",
        description: `Findtern Pro subscription (${durationDays} days)`,
        prefill,
        theme: { color: RAZORPAY_THEME_COLOR },
        modal: {
          ondismiss: () => {
            setBusy(false);
            // Closed without paying: drop the open order so it isn't left dangling.
            void csrfFetch(`${base}/payment/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: order.orderId }) });
          },
        },
        handler: async (response) => {
          try {
            const v = await csrfFetch(`${base}/subscription/verify`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
            });
            const body = await v.json().catch(() => ({}));
            if (!v.ok) throw new Error(body.error ?? "Payment could not be verified.");
            done("Payment received. Findtern Pro is on and the filters are unlocked on Candidates. Your invoice is under Orders.");
          } catch (e) {
            // The gateway may already have debited: no "try again" here, or a second Pay can charge twice.
            const why = e instanceof TypeError ? "Couldn't reach the server to confirm the payment." : errorText(e, "Payment could not be verified.");
            setNotice({ kind: "error", text: `${why} If money was debited, your subscription starts once the gateway confirms it. Check Orders in a few minutes.` });
            setBusy(false);
          }
        },
      });
      rzp.on("payment.failed", (r) => {
        setNotice({ kind: "error", text: r.error.description || "The payment failed. No money was taken." });
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e, "Couldn't start the payment. Try again.") });
      setBusy(false);
    } finally {
      // While the Razorpay popup is open the button stays disabled (busy), so releasing the guard here is safe.
      inFlight.current = false;
    }
  }

  if (success) {
    return (
      <SuccessMoment
        title="Findtern Pro is on"
        body={success}
        actions={
          <Link href="/employer/candidates" className={buttonClass({ variant: "outline", className: "min-h-11" })}>
            Open candidates
          </Link>
        }
      />
    );
  }

  const payLabel = renewing ? `Renew · add ${durationDays} days · ${formatMoney(payable, currency)}` : `Pay ${formatMoney(payable, currency)}`;
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="subscription-promo" className={labelClass}>
          Promo code <span className="font-normal text-ink-600">(optional)</span>
        </label>
        <div className="mt-1.5 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Tag className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" aria-hidden />
            <input
              id="subscription-promo"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (applied) setApplied(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void apply();
                }
              }}
              placeholder="Enter code"
              autoComplete="off"
              spellCheck={false}
              className={`${fieldClass} pl-8 uppercase placeholder:normal-case`}
            />
          </div>
          <button type="button" onClick={() => void apply()} disabled={!code.trim() || checking || busy} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 shrink-0" })}>
            {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {checking ? "Checking" : "Apply"}
          </button>
        </div>
      </div>

      {applied ? (
        <dl className="divide-y divide-ink-200 border-y border-ink-200 text-sm">
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-ink-700">Findtern Pro, {durationDays} days</dt>
            <dd className="nums font-medium text-ink-900">{formatMoney(listMinor, currency)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="min-w-0 break-words text-ink-700">Code {applied.code}</dt>
            <dd className="nums font-medium text-success">−{formatMoney(applied.discountMinor, currency)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="font-semibold text-ink-900">{waived ? "To pay (full waiver)" : "To pay, GST included"}</dt>
            <dd className="nums font-display text-2xl font-semibold text-signal">{formatMoney(payable, currency, { zeroLabel: false })}</dd>
          </div>
        </dl>
      ) : null}

      <button type="button" onClick={() => void pay()} disabled={busy || checking} className={buttonClass({ variant: "primary", block: true, size: "md", className: "nums" })}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : waived ? <CheckCircle2 className="size-4" aria-hidden /> : <CreditCard className="size-4" aria-hidden />}
        {busy ? "Working…" : waived ? (renewing ? `Renew free · add ${durationDays} days` : "Start Findtern Pro (free, code applied)") : payLabel}
      </button>

      <p className="text-sm leading-relaxed text-ink-700">{note}</p>
      <p className="text-xs leading-relaxed text-ink-600">Razorpay handles the card details; this site never sees them. The payment is verified on our server before it counts.</p>

      <div role="status" aria-live="polite" className="min-h-5">
        {notice ? (
          <p className={notice.kind === "error" ? "text-sm font-medium text-danger" : "text-sm font-medium text-success"}>
            {notice.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
