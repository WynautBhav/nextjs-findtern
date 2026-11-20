"use client";

import { useId } from "react";
import { Video } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import type { JoinInput } from "@/lib/interview-join";
import { useJoinState } from "@/components/app/use-join-state";

type BaseProps = {
  /** The interview being joined. The button goes to its recorded gate (/meet/<token>); the Meet URL never reaches this component. */
  interviewId?: string;
  /** False: the booking has no link yet. Shown disabled, with the reason. */
  ready?: boolean;
  /** Why it is disabled (default: the link is not ready). */
  reason?: string;
  size?: "sm" | "md";
  variant?: "primary" | "outline";
  block?: boolean;
  label?: string;
};

type JoinMeetingButtonProps = BaseProps & {
  /**
   * The interview's booking. With it the button follows `joinState`, the same
   * rule the intern sees: disabled with "Join opens at ... (in n min)" until
   * 15 minutes before the start, the button until the window closes, nothing
   * for a cancelled, completed or expired interview.
   */
  interview?: JoinInput;
  /** ISO time on the server (first client render must match it). Required with `interview`. */
  serverNow?: string;
  /** The zone the opening time is shown in (the interview's own). */
  zone?: string | null;
};

/**
 * "Join meeting": a link to GET /api/interviews/[id]/gate, which sends the employer to the interview's /meet/<token> page. That
 * page is the ONE recorded disclaimer gate (10 s countdown, then "I understand and agree"); its redirect to Meet also stamps
 * `employer_joined_at` (an interview nobody joins within 30 minutes of its start expires, bug sheet 12 Nov row 13).
 * With `ready={false}` (the booking has no link yet, bug sheet row 12) the button is shown disabled with the reason beside it.
 */
export function JoinMeetingButton({ interview, serverNow, zone, ...rest }: JoinMeetingButtonProps) {
  if (interview && serverNow) return <GatedJoin interview={interview} serverNow={serverNow} zone={zone} {...rest} />;
  return <BaseJoin {...rest} />;
}

function GatedJoin({ interview, serverNow, zone, ...rest }: BaseProps & { interview: JoinInput; serverNow: string; zone?: string | null }) {
  const join = useJoinState(interview, serverNow, zone);
  if (join.state === "unavailable") return null;
  if (join.state === "ended") return <span className="text-xs text-text-subtle">{join.label}</span>;
  if (join.state === "too_early") return <BaseJoin {...rest} ready={false} reason={join.label} />;
  // No link yet: the employer is told it will be emailed (the company is who shares it).
  if (join.state === "no_link") return <BaseJoin {...rest} ready={false} />;
  return <BaseJoin {...rest} ready />;
}

function BaseJoin({ interviewId, ready = true, reason, size = "sm", variant = "primary", block = false, label = "Join meeting" }: BaseProps) {
  const id = useId();
  if (!ready) {
    return (
      <span className={block ? "grid gap-1" : "inline-flex flex-col items-start gap-1"}>
        <button type="button" disabled aria-describedby={`${id}-wait`} className={buttonClass({ variant: "outline", size, block })}>
          <Video className="size-4" aria-hidden />
          {label}
        </button>
        <span id={`${id}-wait`} className="text-xs text-text-subtle">
          {reason ?? "Link not ready, we'll email it"}
        </span>
      </span>
    );
  }
  if (!interviewId) return null;
  return (
    <a href={`/api/interviews/${encodeURIComponent(interviewId)}/gate`} className={buttonClass({ variant, size, block })}>
      <Video className="size-4" aria-hidden />
      {label}
    </a>
  );
}
