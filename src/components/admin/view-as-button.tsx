"use client";

import { buttonClass } from "@/components/ui/button";
import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

/** Starts a read-only "View as" session; the API audit-logs it. */
export function ViewAsButton({
  targetType,
  targetId,
  label = "View as",
}: {
  targetType: "intern" | "employer";
  targetId: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not start View as");
      window.location.assign(body.redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start View as");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        title="Browse their dashboard read-only, with names and contacts unmasked"
        className={buttonClass({ variant: "outline" })}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        {label}
      </button>
      {error ? <span role="alert" className="mt-1 text-xs text-danger">{error}</span> : null}
    </span>
  );
}
