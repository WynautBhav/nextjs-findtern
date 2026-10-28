"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleSlash, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

/**
 * Approve or send back a submitted timesheet, in place. Approving takes an
 * optional note (legacy managerNote, EMH-24); sending back needs a reason
 * the intern can act on. One textarea, two outcomes, no modal: this is the
 * screen employers use most, and a dialog per click slowed it down.
 */
export function TimesheetDecision({ timesheetId }: { timesheetId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Approving can't be undone, so it takes a second, deliberate tap (QA-132).
  const [confirming, setConfirming] = useState(false);

  async function decide() {
    if (mode === "reject" && !note.trim()) {
      setError("Say what needs fixing. The intern sees this.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await csrfFetch(`/api/timesheets/${encodeURIComponent(timesheetId)}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: mode === "approve" ? "approved" : "rejected", reason: note.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That didn't go through. Nothing changed - try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("You appear to be offline. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Decision" className="grid grid-cols-2 gap-1 rounded-apple-md bg-ink-100 p-1">
        {(
          [
            ["approve", "Approve", CheckCircle2],
            ["reject", "Send back", CircleSlash],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => {
              setMode(value);
              setError("");
              setConfirming(false);
            }}
            className={cn(
              "apple-spring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-apple-sm text-sm font-medium",
              mode === value ? "bg-white text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-900",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-800">
          {mode === "approve" ? "Note to the intern (optional)" : "What needs fixing"}
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={mode === "approve" ? "Thanks - great month." : "Wednesday 12th should be a fixed off, not present."}
          className="apple-spring w-full rounded-apple-sm border border-ink-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {mode === "approve" && confirming ? (
        <div className="grid grid-cols-[1fr_auto] gap-2" role="group" aria-label="Confirm approval">
          <button type="button" onClick={decide} disabled={busy} className={buttonClass({ variant: "primary", block: true })}>
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            Yes, approve and lock
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={buttonClass({ variant: "outline" })}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (mode === "approve" ? setConfirming(true) : void decide())}
          disabled={busy}
          className={buttonClass({ variant: mode === "approve" ? "primary" : "dark", block: true })}
        >
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {mode === "approve" ? "Approve timesheet" : "Send back to the intern"}
        </button>
      )}
      <p className="text-sm leading-relaxed text-ink-600">
        {mode === "approve"
          ? "Approving locks these days for billing and the stipend. It can't be undone."
          : "The intern sees your reason, corrects the days and sends it again."}
      </p>
    </div>
  );
}
