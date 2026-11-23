"use client";

import { useState } from "react";

import { buttonClass } from "@/components/ui/button";
import { CancelMeetingDialog } from "./cancel-meeting-dialog";

/** What the candidate can do to a meeting they are not choosing a time for: cancel it. Only the company offers new times. */
export function InternMeetingActions({ interviewId, canCancel = false }: { interviewId: string; canCancel?: boolean }) {
  const [cancelling, setCancelling] = useState(false);
  return (
    <div className="space-y-3">
      {canCancel ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCancelling(true)} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
            Cancel
          </button>
        </div>
      ) : null}
      <CancelMeetingDialog interviewId={interviewId} open={cancelling} onOpenChange={setCancelling} other="the company" />
    </div>
  );
}
