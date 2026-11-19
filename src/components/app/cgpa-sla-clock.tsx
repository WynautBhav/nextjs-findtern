"use client";

import { useSyncExternalStore } from "react";
import { Timer } from "lucide-react";

import { cgpaClock } from "@/lib/cgpa-verification-flow";
import { TONE_CLASS, type StatusTone } from "@/lib/admin/status-tone";
import { cn } from "@/lib/utils";

const TONE: Record<"ok" | "soon" | "overdue", StatusTone> = { ok: "success", soon: "warning", overdue: "danger" };

/** One tick a second; the snapshot is the whole second, so React sees a stable value between ticks. */
function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
}

/**
 * The CGPA verification clock: time left to the 48 h deadline (or past it), coloured green under 24 h, amber until 48 h,
 * red after. The same rule as the admin queue (`cgpaSla`). The server renders nothing and the browser fills it in after
 * hydration, so a server render can never disagree with the page it hydrates into (as OfferCountdown does).
 */
export function CgpaSlaClock({ acceptedAt, className }: { acceptedAt: string | null; className?: string }) {
  const sec = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => null,
  );
  if (sec === null) return null;
  const { tone, text } = cgpaClock(acceptedAt, new Date(sec * 1000));
  if (tone === "none") return null;
  return (
    <span
      data-testid="cgpa-sla-clock"
      data-tone={tone}
      className={cn("nums inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", TONE_CLASS[TONE[tone]].pill, className)}
    >
      <Timer className="size-3.5 shrink-0" aria-hidden />
      {text}
    </span>
  );
}
