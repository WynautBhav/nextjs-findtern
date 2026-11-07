"use client";

/**
 * "Have a college code?" on the activation step. The college's code covers the
 * fee; it never asks for or compares a college email, so a student whose
 * college email differs from the registered one redeems the same way.
 */

import { useId, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { formatCollegeCode, isCollegeCodeComplete } from "@/components/intern/college-code-format";
import { promoConsentNotice } from "@/lib/college/promo-consent";
import { csrfFetch } from "@/lib/client-fetch";

export function CollegeCodeRedeem({ onRedeemed }: { onRedeemed: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/intern/drive-codes/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: formatCollegeCode(code), declaredAdult: adult }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 404 ? "That code was not found. Check it and try again." : (body.error ?? "That code did not work."));
        return;
      }
      setDone("Your college covers this fee");
      onRedeemed();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="mt-4 flex items-center gap-2 text-sm font-medium text-brand-800">
        <Check className="size-4" aria-hidden />
        {done}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false} aria-controls={id} className="mt-4 min-h-11 rounded-apple-sm text-sm font-medium text-brand-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
        Have a college code?
      </button>
    );
  }

  return (
    <div id={id} className="mt-4 rounded-apple-sm border border-ink-200 p-4">
      <label htmlFor={`${id}-input`} className="text-sm font-medium text-ink-900">
        College code
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id={`${id}-input`}
          type="text"
          value={code}
          onChange={(e) => {
            setCode(formatCollegeCode(e.target.value));
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && adult && isCollegeCodeComplete(code) && !busy) {
              e.preventDefault();
              void redeem();
            }
          }}
          aria-describedby={error ? `${id}-err` : undefined}
          aria-invalid={error ? true : undefined}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={busy}
          className="h-11 min-w-0 sm:flex-1 rounded-apple-sm border border-ink-200 bg-white px-3.5 text-base text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <button type="button" onClick={redeem} disabled={busy || !adult || !isCollegeCodeComplete(code)} className={buttonClass({ variant: "primary", className: "shrink-0" })}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Use code
        </button>
      </div>
      <label className="mt-3 flex min-h-11 items-start gap-3 text-sm leading-relaxed text-ink-700">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} disabled={busy} className="mt-1 size-5 shrink-0 accent-brand-700" />
        <span>{promoConsentNotice("your college")}</span>
      </label>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
