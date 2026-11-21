"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";

type Candidate = { id: string; label: string; sublabel: string };
type Method = "bank" | "upi" | "cash";

const METHODS: { value: Method; label: string }[] = [
  { value: "bank", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
];

const field =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base text-ink-900 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle";
const label = "block text-sm font-medium text-ink-800";

/**
 * Create a manual activation invoice: an intern paid the standard fee off-platform (bank, UPI or cash). It is the
 * existing "mark paid" route, so the settlement, the invoice number and the unlock are exactly what a card payment
 * gets. The amount is always the standard fee (no free-form amount here); the method and the reference are recorded.
 */
export function ManualInternInvoiceForm({ feeMinor }: { feeMinor: number }) {
  const router = useRouter();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; list: Candidate[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [intern, setIntern] = useState<Candidate | null>(null);
  const [method, setMethod] = useState<Method | "">("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; number: string | null; already: boolean } | null>(null);

  // Look the intern up as the admin types (name, email or phone), after a short pause.
  useEffect(() => {
    const q = query.trim();
    if (intern || q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await csrfFetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await res.json().catch(() => null)) as { candidates?: Candidate[] } | null;
        setFound({ q, list: res.ok ? (data?.candidates ?? []) : [] });
      } catch {
        if (!controller.signal.aborted) setFound({ q, list: [] });
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, intern]);

  // Results count only for the text they were found for; older ones are stale and ignored.
  const results = found && found.q === query.trim() ? found.list : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!intern) return setError("Find the intern first, by name or email.");
    if (!method) return setError("Choose how the fee was paid.");
    if (reference.trim().length < 3) return setError("Enter the payment reference (at least 3 characters), such as the bank or UTR number.");
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/interns/${encodeURIComponent(intern.id)}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reference.trim(), method }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; alreadyPaid?: boolean; invoiceNumber?: string | null };
      if (!res.ok) throw new Error(data.error || `The invoice was not created (HTTP ${res.status}).`);
      setDone({ name: intern.label, number: data.invoiceNumber ?? null, already: Boolean(data.alreadyPaid) });
      router.refresh();
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach the server. Nothing was created; try again." : err instanceof Error ? err.message : "The invoice was not created.");
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setDone(null);
    setIntern(null);
    setQuery("");
    setMethod("");
    setReference("");
    setError(null);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-apple-sm bg-[color:var(--admin-panel-2)] p-4 text-sm leading-relaxed text-ink-800">
          <Check className="mr-1.5 inline size-4 text-success" aria-hidden />
          {done.already ? (
            <>
              <span className="font-semibold text-ink-900">{done.name}</span> has already paid, so nothing new was created.
            </>
          ) : (
            <>
              Invoice {done.number ? <span className="nums font-semibold text-ink-900">{done.number}</span> : "created"} for <span className="font-semibold text-ink-900">{done.name}</span>. They are unlocked now, the same as after an online payment.
            </>
          )}
        </p>
        <button type="button" onClick={again} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
          Create another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <label htmlFor={searchId} className={label}>
          Intern
        </label>
        {intern ? (
          <div className="mt-1.5 flex min-h-11 items-center justify-between gap-3 rounded-apple-sm bg-[color:var(--admin-panel-2)] px-3 py-1.5">
            <p className="min-w-0 text-sm">
              <span className="font-medium text-ink-900">{intern.label}</span>
              <span className="ml-2 break-all text-text-subtle">{intern.sublabel}</span>
            </p>
            <button
              type="button"
              onClick={() => setIntern(null)}
              aria-label="Choose a different intern"
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:size-11"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 mt-[3px] size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, email or phone"
                autoComplete="off"
                aria-describedby={`${searchId}-status`}
                className={`${field} pl-9`}
              />
            </div>
            <p id={`${searchId}-status`} role="status" className="mt-1.5 min-h-5 text-xs text-text-subtle">
              {searching ? "Searching…" : results === null ? "Type at least 2 characters." : results.length === 0 ? "No intern matches that." : `${results.length} found. Choose one.`}
            </p>
            {results && results.length > 0 ? (
              <ul className="mt-1 divide-y divide-[color:var(--admin-rule)] overflow-hidden rounded-apple-sm border border-ink-200">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setIntern(c)}
                      className="flex min-h-11 w-full flex-wrap items-baseline gap-x-3 px-3 py-2 text-left text-sm hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="font-medium text-ink-900">{c.label}</span>
                      <span className="break-all text-text-subtle">{c.sublabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>

      <fieldset>
        <legend className={label}>How was it paid?</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <label
              key={m.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-ink-200 px-4 text-sm text-ink-900 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <input type="radio" name="manual-method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="size-4" />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${searchId}-ref`} className={label}>
          Payment reference
        </label>
        <input
          id={`${searchId}-ref`}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="UTR, UPI transaction ID or cash receipt no."
          autoComplete="off"
          maxLength={120}
          className={field}
        />
      </div>

      <p className="text-sm leading-relaxed text-text-subtle">
        Charges the standard activation fee, <span className="nums font-medium text-foreground">{formatMoney(feeMinor, "INR", { zeroLabel: false })}</span>, and unlocks the intern straight away. It cannot be undone from here.
      </p>

      {error ? (
        <p role="alert" className="rounded-apple-sm bg-danger-soft p-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "md", className: "min-h-11 rounded-full px-6" })}>
        {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        Create invoice
      </button>
    </form>
  );
}
