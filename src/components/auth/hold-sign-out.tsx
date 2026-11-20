"use client";

import { useState } from "react";

import { csrfFetch } from "@/lib/client-fetch";

/** Sign out, for the on-hold page: a frozen account can sign in, so it needs the way out too. Same call as the console's Sign out. */
export function HoldSignOut({ to }: { to: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const res = await csrfFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setFailed(true);
      setBusy(false);
      return;
    }
    window.location.assign(to);
  }
  return (
    <div className="mt-5">
      <button type="button" onClick={signOut} disabled={busy} className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-ink-900 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60">
        {busy ? "Signing out…" : "Sign out"}
      </button>
      <p role="alert" className="mt-2 text-sm text-danger empty:hidden">{failed ? "Sign out didn't go through. Check your connection and try again." : null}</p>
    </div>
  );
}
