"use client";

import { useState } from "react";

import { buttonClass } from "@/components/ui/button";
import { IST_ZONE } from "@/lib/format";
import { CancelMeetingDialog } from "./cancel-meeting-dialog";
import { ProposeTimes } from "./propose-times";

type Mode = "waiting" | "booked" | "request";

const COPY: Record<Mode, { open: string; title: string; hint?: string; submit: string }> = {
  waiting: { open: "Revise times", title: "Revise your times", hint: "These replace the times you sent. The company picks one.", submit: "Send these times" },
  booked: {
    open: "Reschedule",
    title: "Propose new times",
    hint: "Your booked time is released and the company picks one of the new times.",
    submit: "Send these times",
  },
  request: {
    open: "Propose times",
    title: "Propose times",
    hint: "Ask the company to meet again. They pick one of the times you offer.",
    submit: "Send request",
  },
};

/**
 * What the intern can do to a meeting that is not theirs to answer: revise their own offer, reschedule or cancel a booked
 * time, or ask for a new meeting once one expired or was cancelled (only ever inside the existing relationship; the route
 * refuses anything else). Times are typed in IST.
 */
export function InternMeetingActions({
  interviewId,
  mode,
  canCancel = false,
  canReschedule = true,
}: {
  interviewId: string;
  mode: Mode;
  canCancel?: boolean;
  canReschedule?: boolean;
}) {
  const [panel, setPanel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const c = COPY[mode];
  const id = encodeURIComponent(interviewId);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canReschedule ? (
          <button
            type="button"
            aria-expanded={panel}
            onClick={() => setPanel((v) => !v)}
            className={buttonClass({ variant: mode === "request" ? "primary" : "outline", size: "sm", className: "min-h-11" })}
          >
            {c.open}
          </button>
        ) : null}
        {canCancel ? (
          <button type="button" onClick={() => setCancelling(true)} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
            Cancel
          </button>
        ) : null}
      </div>
      {panel ? (
        <ProposeTimes
          endpoint={mode === "request" ? "/api/intern/meeting-requests" : `/api/interviews/${id}/reschedule`}
          extra={mode === "request" ? { interviewId } : undefined}
          timezone={IST_ZONE}
          title={c.title}
          hint={c.hint}
          submitLabel={c.submit}
          onClose={() => setPanel(false)}
        />
      ) : null}
      <CancelMeetingDialog interviewId={interviewId} open={cancelling} onOpenChange={setCancelling} other="the company" />
    </div>
  );
}
