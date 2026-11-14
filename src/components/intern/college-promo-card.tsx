"use client";

/**
 * Home for a college-account intern whose fee is not paid yet. No price, no Pay now, no discount: the college
 * has paid, and the one thing to do is enter the promo code it gave. The server checks the code AND the intern's
 * name, phone and email against what the college provided, and answers with one message when anything fails.
 *
 * Below the card, always shown, a secondary way out for an intern the college never gave a code to:
 * switch to an individual account (asks first; the server changes the type and keeps the college link).
 */

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type Phase = "idle" | "busy" | "done";

export function CollegePromoCard({ collegeName, feeLabel }: { collegeName: string; feeLabel: string }) {
  const router = useRouter();
  const uid = useId();
  const inputId = `${uid}-code`;
  const msgId = `${uid}-msg`;
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || !code.trim()) return;
    inFlight.current = true;
    setPhase("busy");
    setError(null);
    try {
      const res = await csrfFetch("/api/intern/college-promo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "We could not apply that code. Try again.");
        setPhase("idle");
        return;
      }
      setPhase("done");
      // The success note stays long enough to read, then Home re-renders as the paid state.
      window.setTimeout(() => router.refresh(), 1600);
    } catch {
      setError("Could not reach the server. Try again.");
      setPhase("idle");
    } finally {
      inFlight.current = false;
    }
  }

  async function switchToIndividual() {
    setSwitching(true);
    setSwitchError(null);
    try {
      const res = await csrfFetch("/api/intern/account-type", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "individual" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSwitchError(typeof body.error === "string" ? body.error : "Could not switch. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setSwitchError("Could not reach the server. Try again.");
    } finally {
      setSwitching(false);
    }
  }

  if (phase === "done") {
    return (
      <div role="status" className="rise flex items-start gap-4 rounded-apple-sm bg-success-soft p-5 text-success">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-white">
          <Check className="size-5" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-snug text-ink-900">Your college has paid your fee. You are all set.</p>
          <p className="mt-1 text-sm text-ink-700">Taking you to your updated Home.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-pretty text-sm text-ink-700">
        Since you applied through <span className="font-medium text-ink-900">{collegeName}</span>, your college has already made the payment. Enter the promo code you received.
      </p>

      <form onSubmit={apply} className="mt-5" noValidate>
        <label htmlFor={inputId} className="text-sm font-medium text-ink-900">
          Promo code
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            disabled={phase === "busy"}
            aria-invalid={error ? true : undefined}
            aria-describedby={msgId}
            className={cn(
              "h-11 min-w-0 flex-1 rounded-lg border bg-white px-3.5 text-base text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
              error ? "border-danger" : "border-ink-300",
            )}
          />
          <button type="submit" disabled={phase === "busy" || !code.trim()} className={buttonClass({ className: "max-sm:w-full" })}>
            {phase === "busy" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Apply
          </button>
        </div>
        {/* One live region, always in the DOM: no layout shift when a result arrives, and the result is announced. */}
        <p id={msgId} role="status" aria-live="polite" className={cn("mt-2 min-h-5 text-sm", error ? "font-medium text-danger" : "text-text-subtle")}>
          {error ?? ""}
        </p>
      </form>

      <div className="mt-4 border-t border-ink-100 pt-4">
        {confirmSwitch ? (
          <div role="group" aria-labelledby={`${uid}-switch-title`} className="rounded-apple-sm bg-ink-50 p-4">
            <p id={`${uid}-switch-title`} className="text-sm font-medium text-ink-900">
              Switch to an individual account?
            </p>
            <p className="mt-1 text-pretty text-sm text-ink-700">
              You will pay the {feeLabel} activation fee yourself. You stay linked to {collegeName}, so you still see its drives. Until you pay, you can switch back.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={switchToIndividual} disabled={switching} className={buttonClass({ variant: "outline", className: "max-sm:w-full" })}>
                {switching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Yes, switch to individual
              </button>
              <button type="button" onClick={() => setConfirmSwitch(false)} disabled={switching} className={buttonClass({ variant: "ghost", className: "max-sm:w-full" })}>
                Keep my college account
              </button>
            </div>
            <p role="alert" className="mt-2 text-sm font-medium text-danger empty:hidden">
              {switchError}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmSwitch(true)}
            className="min-h-11 rounded-apple-sm text-left text-sm font-medium text-brand-700 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            Don&apos;t have a promo code? Switch to an individual account
          </button>
        )}
      </div>
    </div>
  );
}

/** Individual account that is still linked to a code-verified college and unpaid: the way back to the college's payment. */
export function SwitchToCollegeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/intern/account-type", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "college" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "Could not switch. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={go} disabled={busy} className={buttonClass({ variant: "outline", size: "sm", className: "max-sm:w-full" })}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Switch back to College account
      </button>
      <p role="alert" className="mt-2 text-sm font-medium text-danger empty:hidden">
        {error}
      </p>
    </div>
  );
}
