"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { buttonClass } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/app/use-confirm";
import { csrfFetch } from "@/lib/client-fetch";

/** Take a listing down (reason required, confirm first) or restore it. */
export function TakedownAction({ id, name, takenDown }: { id: string; name: string; takenDown: boolean }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(path: "takedown" | "restore", body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/projects/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Could not save the change.");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function takeDown() {
    const ok = await ask({
      title: "Take this listing down?",
      body: `"${name}" disappears from candidate discovery now and the employer is told why. You can restore it later.`,
      confirmLabel: "Take down",
    });
    if (ok) await send("takedown", { reason: reason.trim() });
  }

  async function restore() {
    const ok = await ask({ title: "Restore this listing?", body: `"${name}" becomes visible to candidates again.`, confirmLabel: "Restore", destructive: false });
    if (ok) await send("restore", {});
  }

  if (takenDown) {
    return (
      <div className="space-y-1">
        {dialog}
        <button type="button" disabled={busy} onClick={() => void restore()} className={buttonClass({ variant: "outline", size: "sm" })}>
          Restore
        </button>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="min-w-48 space-y-2 whitespace-normal">
      {dialog}
      {open ? (
        <>
          <label htmlFor={`td-${id}`} className="text-sm font-medium">Reason for the employer (required)</label>
          <Textarea id={`td-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !reason.trim()} onClick={() => void takeDown()} className={buttonClass({ size: "sm" })}>
              Take down…
            </button>
            <button type="button" onClick={() => { setOpen(false); setReason(""); setError(null); }} className={buttonClass({ variant: "outline", size: "sm" })}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "outline", size: "sm" })}>
          Take down…
        </button>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
