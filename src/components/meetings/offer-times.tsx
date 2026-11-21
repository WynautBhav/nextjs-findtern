"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { MeetingSlots, type Slots } from "@/components/employer/meeting-slots";
import { cannotSend, offerProblem, REQUIRED_SLOTS } from "@/components/employer/meeting-slots-model";
import { suggestedSlots } from "@/lib/employer-interview-rules";
import { postMeeting, STALE_CODES } from "./meeting-api";

/**
 * The employer's inline panel for new times on an existing meeting (after a reschedule request, a lapsed offer, or a reschedule):
 * exactly three, sent to the reschedule route as `{ slots }`. It mounts when opened, so the suggestions are from that moment.
 */
export function OfferTimes({
  interviewId,
  timezone,
  title,
  hint,
  submitLabel = "Offer these 3 time slots",
  onClose,
  onSent,
}: {
  interviewId: string;
  /** The zone the times are typed in: the project's. */
  timezone: string;
  title: string;
  hint?: string;
  submitLabel?: string;
  onClose: () => void;
  /** Called after the route accepted (the page is refreshed too). */
  onSent?: () => void;
}) {
  const router = useRouter();
  const errId = useId();
  const [slots, setSlots] = useState<Slots>(() => suggestedSlots(Date.now(), timezone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const shownError = error || (touched ? offerProblem(slots) : null);

  async function send() {
    const problem = offerProblem(slots);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    const r = await postMeeting(`/api/interviews/${encodeURIComponent(interviewId)}/reschedule`, { slots });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      // The meeting moved on while this was open: show what is true now, keep the sentence.
      if (r.code && STALE_CODES.has(r.code)) router.refresh();
      return;
    }
    onSent?.();
    onClose();
    router.refresh();
  }

  return (
    <div className="rounded-apple-lg border border-ink-200/80 bg-ink-50/70 p-4">
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">
        {hint ?? `Pick ${REQUIRED_SLOTS} time slots the candidate can choose from. We suggest the next quarter hour and the two hours after it; change any.`} Times are in{" "}
        {timezone === "Asia/Kolkata" ? "India time (IST)" : timezone}.
      </p>
      <div className="mt-3">
        <MeetingSlots
          slots={slots}
          timezone={timezone}
          invalid={Boolean(shownError)}
          describedBy={errId}
          onChange={(next) => {
            setSlots(next);
            setTouched(true);
            setError("");
          }}
        />
      </div>
      {shownError ? (
        <p id={errId} role="alert" className="mt-3 text-sm text-danger">
          {shownError}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={send} disabled={busy || cannotSend(slots, timezone)} className={buttonClass({ size: "sm", className: "min-h-11" })}>
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {submitLabel}
        </button>
        <button type="button" onClick={onClose} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
          Close
        </button>
      </div>
    </div>
  );
}
