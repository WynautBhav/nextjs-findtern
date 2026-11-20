"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/employer/ui-tokens";
import { REQUEST_REASON_MAX } from "@/lib/meetings/slots";
import { cn } from "@/lib/utils";
import { CancelMeetingDialog } from "./cancel-meeting-dialog";
import { postMeeting, STALE_CODES } from "./meeting-api";

/**
 * The candidate asks the company to reschedule: no times of their own, only an optional short note. The company is told to
 * offer three new times; a booked time is released.
 */
export function RescheduleRequestPanel({ interviewId, booked, onClose }: { interviewId: string; booked: boolean; onClose: () => void }) {
  const router = useRouter();
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    const r = await postMeeting(`/api/interviews/${encodeURIComponent(interviewId)}/request-reschedule`, reason.trim() ? { reason: reason.trim() } : {});
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (r.code && STALE_CODES.has(r.code)) router.refresh();
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="rounded-apple-lg border border-ink-200/80 bg-ink-50/70 p-4">
      <p className="text-sm font-semibold text-ink-900">Ask the company to reschedule</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">
        The company offers 3 new times and you choose one.{booked ? " Your booked time is released." : ""} You don&apos;t pick the times yourself.
      </p>
      <label htmlFor={`${id}-note`} className={cn(labelClass, "mt-3 block")}>
        Reason (optional)
      </label>
      <textarea
        id={`${id}-note`}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setError("");
        }}
        rows={2}
        maxLength={REQUEST_REASON_MAX}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(fieldClass, "mt-1.5 py-2.5 leading-relaxed")}
      />
      <p className="nums mt-1 text-xs text-text-subtle">
        {reason.length}/{REQUEST_REASON_MAX}
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={send} disabled={busy} className={buttonClass({ size: "sm", className: "min-h-11" })}>
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Send request
        </button>
        <button type="button" onClick={onClose} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
          Close
        </button>
      </div>
    </div>
  );
}

/** What the candidate can do to a meeting they are not choosing a time for: ask to reschedule (no times of their own) or cancel. */
export function InternMeetingActions({
  interviewId,
  booked = false,
  canCancel = false,
  canRequestReschedule = true,
}: {
  interviewId: string;
  booked?: boolean;
  canCancel?: boolean;
  canRequestReschedule?: boolean;
}) {
  const [panel, setPanel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canRequestReschedule ? (
          <button type="button" aria-expanded={panel} onClick={() => setPanel((v) => !v)} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
            Ask to reschedule
          </button>
        ) : null}
        {canCancel ? (
          <button type="button" onClick={() => setCancelling(true)} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
            Cancel
          </button>
        ) : null}
      </div>
      {panel ? <RescheduleRequestPanel interviewId={interviewId} booked={booked} onClose={() => setPanel(false)} /> : null}
      <CancelMeetingDialog interviewId={interviewId} open={cancelling} onOpenChange={setCancelling} other="the company" />
    </div>
  );
}
