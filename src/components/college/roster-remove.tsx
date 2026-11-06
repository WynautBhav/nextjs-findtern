"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/app/use-confirm";
import { csrfFetch } from "@/lib/client-fetch";

/** Take one student off the roster. Their account and college membership are not touched. */
export function RosterRemove({ email, name }: { email: string; name: string }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    const ok = await ask({
      title: "Remove from roster?",
      body: `${name || email} will no longer be on your student list. Their Findtern account is not affected.`,
      confirmLabel: "Yes, remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await csrfFetch("/api/college/roster", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emails: [email] }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not remove. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not remove. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start sm:items-end">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label={`Remove ${name || email} from roster`}
        className="inline-flex min-h-11 items-center rounded-apple-sm px-3 text-sm font-medium text-danger hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-brand-700 disabled:opacity-60"
      >
        {busy ? "Removing…" : "Remove"}
      </button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
      {dialog}
    </span>
  );
}
