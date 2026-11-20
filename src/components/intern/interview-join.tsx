"use client";

import { useId } from "react";
import { Video } from "lucide-react";

import { useJoinState } from "@/components/app/use-join-state";
import { MeetingJoinButton } from "@/components/intern/meeting-join";
import { buttonClass } from "@/components/ui/button";
import type { JoinInput } from "@/lib/interview-join";

/**
 * The intern's Join meeting button for one booked interview, driven by
 * `joinState` (the same helper the employer side uses):
 *
 *   open       the button (it opens Findtern's meeting page with the rules; the Meet link is behind that)
 *   too_early  disabled, "Join opens at 3:15 PM IST (in 30 min)"
 *   no_link    disabled, "Waiting for the company to share a meeting link"
 *   ended      "This interview has ended", no button
 *   unavailable  nothing (cancelled, completed, expired, not booked)
 *
 * Times are India time, as everywhere an intern sees one.
 */
export function InterviewJoin({
  interview,
  serverNow,
  block = false,
  size = "md",
}: {
  interview: JoinInput;
  /** ISO time on the server; keeps the first client render equal to the server's. */
  serverNow: string;
  block?: boolean;
  size?: "sm" | "md";
}) {
  const join = useJoinState(interview, serverNow);
  const reasonId = useId();

  if (join.state === "unavailable") return null;
  if (join.state === "ended") return <p className="text-sm text-text-subtle">{join.label}</p>;
  if (join.state === "open" && interview.id) {
    return (
      <div className={block ? "grid gap-2" : "grid justify-items-start gap-2"} data-join-state="open">
        <MeetingJoinButton interviewId={interview.id} block={block} size={size} />
        <p className="text-pretty text-xs text-text-subtle">Join a few minutes early. The meeting rules show first.</p>
      </div>
    );
  }
  return (
    <div className={block ? "grid gap-2" : "grid justify-items-start gap-2"} data-join-state={join.state}>
      <button type="button" disabled aria-describedby={reasonId} className={buttonClass({ variant: "outline", size, block })}>
        <Video className="size-4" aria-hidden />
        Join meeting
      </button>
      <p id={reasonId} className="text-pretty text-sm text-text-subtle">
        {join.label}
      </p>
    </div>
  );
}
