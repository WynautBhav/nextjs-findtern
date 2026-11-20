"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/** Sends Drive back to the calendar's Google account (POST needs the CSRF header, so this is not a plain form). */
export function GoogleDriveResetButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/admin/google/drive-reset", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Couldn't reset the Drive connection.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={reset}
        disabled={busy}
        className={buttonClass({ variant: "outline", size: "sm", className: ADMIN_PILL_SECONDARY })}
      >
        {busy ? "Switching…" : "Use the calendar account"}
      </button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
