import { CalendarCheck } from "lucide-react";

import { sendProposalHold } from "@/lib/proposal-guard";
import { cn } from "@/lib/utils";

/**
 * Stands in for "Send proposal" while a booked meeting is still pending: a
 * disabled-looking control with the date, and the reason as visible text
 * beneath it (a tooltip alone is invisible on a phone). Renders nothing when
 * there is no pending meeting, so a caller can write
 * `hold ?? <SendButton />` through `sendProposalHold`.
 */
export function SendProposalHold({
  pendingMeetingAt,
  className,
  controlClassName,
}: {
  pendingMeetingAt: string | null | undefined;
  className?: string;
  controlClassName?: string;
}) {
  const hold = sendProposalHold(pendingMeetingAt);
  if (!hold) return null;
  return (
    <span className={cn("flex min-w-0 flex-col items-end gap-1", className)}>
      <span
        aria-disabled="true"
        className={cn(
          "inline-flex h-11 cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-full bg-ink-100 px-4 text-sm font-medium text-ink-600 sm:h-9 sm:touch:h-11",
          controlClassName,
        )}
      >
        <CalendarCheck className="size-4" aria-hidden />
        {hold.label}
      </span>
      <span className="text-xs text-ink-600">{hold.reason}</span>
    </span>
  );
}
