"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * Top of Home while Open to work is off: the profile is invisible to employers,
 * and a text line further down is easy to miss (bug sheet 12 Nov, row 22). The
 * dot pulses to draw the eye; `motion-safe:` means a reduced-motion setting
 * gets a still dot. The action flips the same `openToWork` flag the profile
 * switch does.
 */
export function HiddenProfileBanner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function turnOn() {
    setBusy(true);
    setError("");
    try {
      const res = await csrfFetch("/api/intern/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openToWork: true }),
      });
      if (!res.ok) {
        setError("Could not save. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Profile hidden"
      className="flex flex-col gap-2 rounded-apple-sm border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-ink-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3.5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="relative mt-1 grid size-3 shrink-0 place-items-center" aria-hidden>
          <span className="absolute inline-flex size-3 rounded-full bg-warning opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-warning motion-safe:animate-pulse" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold">
            <EyeOff className="size-4 shrink-0" aria-hidden />
            Your profile is hidden from employers
          </p>
          <p className="leading-snug text-pretty text-ink-700 sm:mt-0.5 sm:leading-relaxed">
            No one can find you, book an interview or send an offer until you turn Open to work back on.
          </p>
          {error ? (
            <p role="alert" className="mt-1 font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <button type="button" onClick={turnOn} disabled={busy} className={buttonClass({ variant: "primary", className: "shrink-0 max-sm:w-full" })}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Turn on Open to work
      </button>
    </section>
  );
}
