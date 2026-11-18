"use client";

import { buttonClass } from "@/components/ui/button";
import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { QUICK_ACTION_CLASS } from "@/components/admin/record-layout";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { cn } from "@/lib/utils";

/** Starts a read-only "View as" session; the API audit-logs it. */
export function ViewAsButton({
  targetType,
  targetId,
  label = "View as",
  appearance = "button",
}: {
  targetType: "intern" | "employer";
  targetId: string;
  label?: string;
  /** "tile" is the 44px icon tile on the record card; its accessible name is still `label`. */
  appearance?: "button" | "tile";
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

  if (appearance === "tile") {
    return (
      <span className="inline-flex flex-col items-center">
        <button type="button" onClick={start} disabled={busy} aria-label={label} title={label} className={QUICK_ACTION_CLASS}>
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
        {error ? <span role="alert" className="mt-1 max-w-40 text-center text-xs text-danger">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        title="Browse their dashboard read-only, with names and contacts unmasked"
        className={cn(buttonClass({ variant: "outline" }), ADMIN_PILL_SECONDARY)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        {label}
      </button>
      {error ? <span role="alert" className="mt-1 text-xs text-danger">{error}</span> : null}
    </span>
  );
}
