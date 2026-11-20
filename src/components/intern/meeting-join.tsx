import { Video } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

/**
 * The intern's Join button for a booked company meeting: a link to GET /api/interviews/[id]/gate, which sends them to the
 * interview's /meet/<token> page, the ONE recorded disclaimer gate (10 s countdown, then "I understand and agree").
 * The Meet URL never reaches this component.
 */
export function MeetingJoinButton({ interviewId, block, size = "md", label = "Join meeting" }: { interviewId: string; block?: boolean; size?: "sm" | "md"; label?: string }) {
  return (
    <a href={`/api/interviews/${encodeURIComponent(interviewId)}/gate`} className={buttonClass({ variant: "primary", size, block })}>
      <Video className="size-4" aria-hidden />
      {label}
    </a>
  );
}
