"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { sendInline } from "@/components/admin/inline-control";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const REASON_MIN = 3;
const REASON_MAX = 500;

/**
 * Moderation for one listing (OA8): "Take down" asks for a reason the employer
 * will read; "Restore" puts it back. Needs the companies:write permission, so
 * the page only renders it for admins who have it.
 */
export function ProjectTakedown({ projectId, name, takenDown, reason }: { projectId: string; name: string; takenDown: boolean; reason?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { action: "take_down"; reason: string } | { action: "restore" }) {
    setBusy(true);
    setError(null);
    const res = await sendInline({ url: `/api/admin/projects/${encodeURIComponent(projectId)}/status`, method: "PUT" }, body);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setOpen(false);
    setText("");
    router.refresh();
  }

  if (takenDown) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button type="button" disabled={busy} onClick={() => send({ action: "restore" })} className={buttonClass({ variant: "outline", size: "sm" })}>
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Restore
          <span className="sr-only"> {name}</span>
        </button>
        {reason ? <span className="max-w-48 whitespace-normal text-xs text-text-subtle">Reason: {reason}</span> : null}
        {error ? <span role="alert" className="text-xs font-medium text-danger">{error}</span> : null}
      </span>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "outline", size: "sm" })}>
        Take down
        <span className="sr-only"> {name}</span>
      </button>
      <Dialog open={open} onOpenChange={(next) => (!busy ? setOpen(next) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take down this listing?</DialogTitle>
            <DialogDescription>
              “{name}” leaves discovery and its public page at once. The company is told your reason and cannot reopen it; you can restore it here.
            </DialogDescription>
          </DialogHeader>
          <label className="block text-sm font-medium text-ink-900" htmlFor={`takedown-reason-${projectId}`}>
            Reason the company will see
          </label>
          <textarea
            id={`takedown-reason-${projectId}`}
            value={text}
            maxLength={REASON_MAX}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={error ? `takedown-error-${projectId}` : undefined}
            className="w-full rounded-apple-sm border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-900"
          />
          <p className="nums text-xs text-text-subtle">{text.trim().length} / {REASON_MAX}</p>
          {error ? <p id={`takedown-error-${projectId}`} role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
          <DialogFooter>
            <button type="button" autoFocus onClick={() => setOpen(false)} disabled={busy} className={buttonClass({ variant: "outline", size: "sm" })}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => send({ action: "take_down", reason: text.trim() })}
              disabled={busy || text.trim().length < REASON_MIN}
              className={buttonClass({ variant: "dark", size: "sm" })}
            >
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Take down
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
