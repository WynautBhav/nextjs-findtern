"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { buttonClass } from "@/components/ui/button";
import { useConfirm } from "@/components/app/use-confirm";

/**
 * Delete a draft, or withdraw a sheet that is waiting for approval (legacy
 * rule, INW-18). Approved and sent-back sheets never get this button.
 */
export function DeleteSheetButton({
  timesheetId,
  withdraw,
  redirectTo,
  size = "sm",
}: {
  timesheetId: string;
  /** A submitted sheet: worded as withdrawing it from the manager. */
  withdraw: boolean;
  /** Where to go after deleting (from the sheet's own page). */
  redirectTo?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { ask: askConfirm, dialog } = useConfirm();

  async function run() {
    const ok = await askConfirm({
      title: withdraw ? "Withdraw this timesheet?" : "Delete this timesheet?",
      body: withdraw ? "Your manager no longer sees it, and the sheet and its days are deleted. This can't be undone." : "The sheet and its days are deleted. This can't be undone.",
      confirmLabel: withdraw ? "Yes, withdraw it" : "Yes, delete it",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await csrfFetch(`/api/intern/timesheets/${timesheetId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error || "That did not work. Try again.");
        return;
      }
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Could not reach Findtern. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {dialog}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={buttonClass({ variant: "ghost", size, className: "text-danger hover:bg-danger-soft" })}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {withdraw ? "Withdraw" : "Delete"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
