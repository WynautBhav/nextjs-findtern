"use client";

import { useState } from "react";
import { Check, Copy, Loader2, ShieldAlert, Sparkles } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { isoToIstInput, istInputToIso } from "@/lib/admin/promo-form-time";
import { FULL_WAIVER_LIMITS, generateWaiverCode } from "@/lib/full-waiver";
import type { PromoCode } from "@/lib/db/schema";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle focus:border-brand-500";

const DAY_MS = 86_400_000;
type Audience = "employer" | "intern" | "both";
const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "employer", label: "Company" },
  { value: "intern", label: "Intern" },
  { value: "both", label: "Both" },
];

/**
 * Create a full-waiver code: a code that makes a whole payment free (monthly charge and hiring fee).
 * Always capped: 1 to 25 uses, an expiry within 30 days, an audience chosen on purpose. The server enforces the same caps;
 * these inputs only make the right choice the easy one. The code is shown once, here, after it is created.
 */
export function FullWaiverDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (promo: PromoCode) => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [code, setCode] = useState("");
  const [appliesTo, setAppliesTo] = useState<Audience | "">("");
  const [maxUsages, setMaxUsages] = useState<number | string>(FULL_WAIVER_LIMITS.maxUsesDefault);
  const [validUntil, setValidUntil] = useState(() => isoToIstInput(new Date(Date.now() + FULL_WAIVER_LIMITS.expiryDaysDefault * DAY_MS)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<PromoCode | null>(null);
  const [copied, setCopied] = useState(false);
  // Fixed when the dialog mounts (the form is rebuilt each time it opens); the server checks the cap against its own clock.
  const [latest] = useState(() => isoToIstInput(new Date(Date.now() + FULL_WAIVER_LIMITS.expiryDaysCap * DAY_MS)));

  function reset() {
    setConfirmed(false);
    setCode("");
    setAppliesTo("");
    setMaxUsages(FULL_WAIVER_LIMITS.maxUsesDefault);
    setValidUntil(isoToIstInput(new Date(Date.now() + FULL_WAIVER_LIMITS.expiryDaysDefault * DAY_MS)));
    setError("");
    setCreated(null);
    setCopied(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!appliesTo) return setError("Choose who can use this code: companies, interns or both.");
    const uses = Number(maxUsages);
    if (!Number.isInteger(uses) || uses < 1 || uses > FULL_WAIVER_LIMITS.maxUsesCap) return setError(`Max uses must be a whole number from 1 to ${FULL_WAIVER_LIMITS.maxUsesCap}.`);
    const until = istInputToIso(validUntil);
    if (!until) return setError("Set an expiry date.");
    setSaving(true);
    try {
      const res = await csrfFetch("/api/admin/promo-codes/full-waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(code.trim() ? { code: code.trim().toUpperCase() } : {}), appliesTo, maxUsages: uses, validUntil: until }),
      });
      const data = (await res.json().catch(() => ({}))) as { promo?: PromoCode; error?: string };
      if (!res.ok || !data.promo) throw new Error(data.error || "Could not create the code.");
      setCreated(data.promo);
      onCreated(data.promo);
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach the server. Try again." : err instanceof Error ? err.message : "Could not create the code.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the code and copy it by hand.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="apple-admin max-h-[90dvh] max-w-md overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
            <ShieldAlert className="size-5 text-danger" aria-hidden />
            New full-waiver code
          </DialogTitle>
          <DialogDescription className="text-sm">Makes one whole payment free, with no card and no Razorpay.</DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-ink-800">Code created. Copy it now; share it only with the person it is for.</p>
            <div className="flex items-center gap-2 rounded-apple-sm border border-brand-200 bg-brand-50 p-3">
              <code data-testid="waiver-code" className="min-w-0 flex-1 break-all text-base font-semibold tracking-[0.08em] text-ink-900">{created.code}</code>
              <button type="button" onClick={() => void copy()} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
                {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
            <DialogFooter>
              <button type="button" onClick={() => { onOpenChange(false); reset(); }} className={buttonClass({ variant: "primary", size: "md" })}>Done</button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 pt-2">
            <div role="alert" className="rounded-apple-sm border border-danger/40 bg-danger-soft p-3 text-sm leading-relaxed text-danger">
              <p className="font-semibold">This code makes the whole payment free.</p>
              <p className="mt-1">
                Whoever has it completes their payment at no charge: the monthly amount and the hiring fee. Share it only with the person it is for. It works for the number of uses and until the date below, then stops.
              </p>
            </div>
            {error ? <p id="waiver-error" role="alert" className="rounded-apple-sm bg-danger-soft p-3 text-sm font-medium text-danger">{error}</p> : null}

            <label className="flex min-h-11 items-start gap-3 text-sm font-medium text-ink-900">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-5 shrink-0" />
              <span>Full waiver: makes the whole payment free (for testing and complimentary hires)</span>
            </label>

            <fieldset disabled={!confirmed} className="space-y-4 disabled:opacity-50">
              <div>
                <label htmlFor="waiver-code" className="block text-sm font-semibold text-ink-800">
                  Code <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <input id="waiver-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Leave empty to generate" autoComplete="off" className={`${inputClass} uppercase tracking-[0.08em]`} />
                  <button type="button" onClick={() => setCode(generateWaiverCode())} className={buttonClass({ variant: "outline", size: "sm", className: "mt-1.5 min-h-11 shrink-0" })}>
                    <Sparkles className="size-4" aria-hidden />
                    Generate code
                  </button>
                </div>
              </div>

              <fieldset>
                <legend className="block text-sm font-semibold text-ink-800">Who can use it</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {AUDIENCES.map((a) => (
                    <label key={a.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-ink-200 px-4 text-sm text-ink-900 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input type="radio" name="waiver-audience" value={a.value} checked={appliesTo === a.value} onChange={() => setAppliesTo(a.value)} className="size-4" />
                      {a.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="waiver-uses" className="block text-sm font-semibold text-ink-800">Max uses (1 to {FULL_WAIVER_LIMITS.maxUsesCap})</label>
                  <input id="waiver-uses" type="number" inputMode="numeric" required min={1} max={FULL_WAIVER_LIMITS.maxUsesCap} step={1} value={maxUsages} onChange={(e) => setMaxUsages(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="waiver-until" className="block text-sm font-semibold text-ink-800">Expires (IST, within {FULL_WAIVER_LIMITS.expiryDaysCap} days)</label>
                  <input
                    id="waiver-until"
                    type="datetime-local"
                    required
                    value={validUntil}
                    max={latest}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="text-xs text-ink-600">Each account can use a code once.</p>
            </fieldset>

            <DialogFooter>
              <button type="button" onClick={() => { onOpenChange(false); reset(); }} className={buttonClass({ variant: "ghost", size: "md" })}>Cancel</button>
              <button type="submit" disabled={!confirmed || saving} className={buttonClass({ variant: "primary", size: "md" })}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Create full-waiver code
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
