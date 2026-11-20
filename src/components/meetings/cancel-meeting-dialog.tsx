"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fieldClass, labelClass } from "@/components/employer/ui-tokens";
import { REASON_MAX, reasonProblem } from "@/lib/meetings/slots";
import { cn } from "@/lib/utils";
import { postMeeting } from "./meeting-api";

/** Cancel a meeting (an open offer or a booked time). The other side is told, with the reason. */
export function CancelMeetingDialog({
  interviewId,
  open,
  onOpenChange,
  other,
}: {
  interviewId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Who is told: "the company" or "the candidate". */
  other: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <CancelForm interviewId={interviewId} other={other} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CancelForm({ interviewId, other, onClose }: { interviewId: string; other: string; onClose: () => void }) {
  const router = useRouter();
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = reasonProblem(reason);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    const r = await postMeeting(`/api/interviews/${encodeURIComponent(interviewId)}/cancel`, { reason: reason.trim() });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cancel this meeting?</DialogTitle>
        <DialogDescription>Tell {other} why. They see your reason.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3 pt-1">
        <div>
          <label htmlFor={`${id}-reason`} className={labelClass}>
            Reason
          </label>
          <textarea
            id={`${id}-reason`}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
            rows={3}
            maxLength={REASON_MAX}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            autoFocus
            className={cn(fieldClass, "mt-1.5 py-2.5 leading-relaxed")}
          />
        </div>
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <button type="button" onClick={onClose} className={buttonClass({ variant: "light", size: "sm", className: "min-h-11" })}>
            Keep meeting
          </button>
          <button type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11" })}>
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            Cancel meeting
          </button>
        </DialogFooter>
      </form>
    </>
  );
}
