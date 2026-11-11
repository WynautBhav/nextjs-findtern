"use client";

/**
 * "Your college paid your fee." Shown to a student the college's sheet was matched to. One tick (18+ and the
 * college notice) and one button; the server finds their code, so there is nothing to type.
 */

import { useId, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { promoConsentNotice } from "@/lib/college/promo-consent";
import { csrfFetch } from "@/lib/client-fetch";

export function CollegeClaim({ collegeName, onClaimed }: { collegeName: string; onClaimed: () => void }) {
  const id = useId();
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/intern/drive-codes/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ declaredAdult: adult }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "Could not accept it. Try again.");
      onClaimed();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="note" className="mt-3 rounded-apple-sm border border-brand-200 bg-brand-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-900">
        <Check className="size-4 shrink-0" aria-hidden />
        {collegeName} has paid your Findtern fee
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink-700">Accept it to activate your profile. You do not pay anything and you do not need a code.</p>
      <label htmlFor={id} className="mt-3 flex min-h-11 items-start gap-3 text-sm leading-relaxed text-ink-700">
        <input id={id} type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} disabled={busy} className="mt-1 size-5 shrink-0 accent-brand-700" />
        <span>{promoConsentNotice("your college")}</span>
      </label>
      <button type="button" onClick={claim} disabled={busy || !adult} className={buttonClass({ variant: "primary", size: "sm", className: "mt-2" })}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Accept and activate
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
