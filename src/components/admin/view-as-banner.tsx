"use client";

import { buttonClass } from "@/components/ui/button";
import { useState } from "react";
import { Eye, Loader2, LogOut } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

/**
 * Pinned to the bottom of every intern / employer screen while an admin is
 * using "View as", so it is impossible to forget whose account this is. Fixed
 * rather than in-flow so neither app shell's layout has to make room for it.
 */
export function ViewAsBanner({ viewing, admin }: { viewing: string; admin: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exit() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/admin/impersonate/stop", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not exit");
      window.location.assign(body.redirect ?? "/admin/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not exit");
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-apple-xl border border-accent-300 bg-ink-950 px-4 py-3 text-sm text-white shadow-2xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      <Eye className="size-4 shrink-0 text-accent-300" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Viewing as {viewing}</span>
        <span className="block text-sm text-ink-300">
          Read-only · full names and contacts unmasked · signed in as {admin}
        </span>
        {error ? <span role="alert" className="block text-sm text-danger-soft">{error}</span> : null}
      </p>
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        className={buttonClass({ variant: "white", size: "sm", className: "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300" })}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <LogOut className="size-3.5" aria-hidden />}
        Exit
      </button>
    </div>
  );
}
