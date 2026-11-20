"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { DISCLAIMER, GATE_SECONDS } from "@/lib/meetings/gate-text";

/** What the screen reader hears, and when: at the start, at five seconds, and when the button unlocks. Never every second. */
export const announcement = (left: number): string =>
  left <= 0 ? "You can continue now." : left === GATE_SECONDS ? `You can continue in ${GATE_SECONDS} seconds.` : left === 5 ? "5 seconds left." : "";

/**
 * The recorded pre-join gate. The countdown is a browser timer; the server does its own check against the signed `stamp`
 * (see src/lib/meetings/gate.ts), so skipping the wait here only gets a 409. `startLeft` exists for the design harness.
 */
export function MeetingGate({ token, stamp, backHref, startLeft = GATE_SECONDS }: { token: string; stamp: string; backHref: string; startLeft?: number }) {
  const [left, setLeft] = useState(startLeft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; restart: boolean } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [spoken, setSpoken] = useState(announcement(startLeft));

  useEffect(() => {
    heading.current?.focus();
    if (startLeft <= 0) return;
    const started = Date.now();
    const t = window.setInterval(() => {
      const remaining = Math.max(0, startLeft - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      // Spoken only when it changes to something worth saying (start, 5 s, unlocked), never every second.
      const said = announcement(remaining);
      if (said) setSpoken(said);
      if (remaining === 0) window.clearInterval(t);
    }, 250);
    return () => window.clearInterval(t);
  }, [startLeft]);

  // The button unlocks: hand it focus unless the person is already on something else (the back link).
  useEffect(() => {
    if (left !== 0) return;
    const a = document.activeElement;
    if (!a || a === document.body || a === heading.current) button.current?.focus();
  }, [left]);

  async function accept() {
    if (left > 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/meet/${encodeURIComponent(token)}/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stamp }) });
      const data = (await res.json().catch(() => ({}))) as { next?: string; error?: string; code?: string };
      if (!res.ok || !data.next) {
        setError({ text: data.error ?? "Could not record this. Please try again.", restart: data.code === "restart" });
        setBusy(false);
        return;
      }
      window.location.assign(data.next);
    } catch {
      setError({ text: "Could not reach the server. Check your connection and try again.", restart: false });
      setBusy(false);
    }
  }

  const progress = Math.round(((GATE_SECONDS - left) / GATE_SECONDS) * 100);
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-8 sm:px-5 sm:pb-14 sm:pt-14">
      <div className="rounded-apple-xl border border-ink-200/80 bg-white p-5 shadow-sm sm:p-8">
        <h1 ref={heading} tabIndex={-1} className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.015em] text-ink-900 outline-none">
          <ShieldCheck className="size-6 shrink-0 text-brand-700" aria-hidden />
          {DISCLAIMER.title}
        </h1>
        <p className="mt-3 text-pretty text-base leading-relaxed text-ink-700">{DISCLAIMER.intro}</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink-800">
          {DISCLAIMER.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-4 text-pretty text-base leading-relaxed text-ink-800">{DISCLAIMER.recorded}</p>
        <p className="mt-3 text-pretty text-base leading-relaxed text-ink-800">{DISCLAIMER.consequence}</p>
        <p className="mt-3 text-base font-medium text-ink-900">{DISCLAIMER.agree}</p>

        <div className="mt-6" data-gate-left={left}>
          {/* Visual countdown only; the polite region below speaks it sparingly. */}
          <div aria-hidden className="flex items-center gap-3">
            <span className="w-12 text-2xl font-semibold tabular-nums text-brand-700">{left}<span className="ml-0.5 text-sm font-medium">s</span></span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
              <span className="block h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-linear motion-reduce:transition-none" style={{ width: `${progress}%` }} />
            </span>
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {spoken}
          </p>
          <p id="gate-hint" className="mt-2 text-sm text-ink-600">
            {left > 0 ? `The button unlocks in ${left} second${left === 1 ? "" : "s"}. Please read the rules above.` : "You can continue."}
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error.text}
            {error.restart ? (
              <>
                {" "}
                <button type="button" onClick={() => window.location.reload()} className="min-h-11 font-medium underline underline-offset-2">
                  Reload
                </button>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <a href={backHref} className="inline-flex min-h-11 items-center justify-center rounded-apple-lg px-3 text-sm font-medium text-ink-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            Not now
          </a>
          <button ref={button} type="button" disabled={left > 0 || busy} aria-describedby="gate-hint" onClick={accept} className={buttonClass({ variant: "primary", size: "md", className: "min-h-11 w-full sm:w-auto" })}>
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            I understand and agree
          </button>
        </div>
      </div>
    </main>
  );
}
