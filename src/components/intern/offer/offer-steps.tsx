import { Check } from "lucide-react";

import type { InternOfferKey } from "@/lib/intern-offer-view";
import { cn } from "@/lib/utils";

/** Where an offer is on its way: sent, accepted, hired. Closed offers show no track, only their end state. */
export function OfferSteps({ stateKey, fullTime, className }: { stateKey: InternOfferKey; fullTime: boolean; className?: string }) {
  const steps = fullTime ? ["Offer sent", "Hired"] : ["Offer sent", "Accepted", "Hired"];
  const at =
    stateKey === "hired" || stateKey === "fulltime_hired"
      ? steps.length - 1
      : stateKey === "accepted"
        ? 1
        : stateKey === "sent" || stateKey === "interview_scheduled"
          ? 0
          : -1;
  if (at < 0) return null;
  const done = at === steps.length - 1;
  return (
    <ol className={cn("flex items-center", className)} aria-label="Offer progress">
      {steps.map((s, i) => {
        const reached = i < at || (done && i === at);
        const current = i === at && !done;
        return (
          <li key={s} className={cn("flex items-center", i < steps.length - 1 && "flex-1")} aria-current={current ? "step" : undefined}>
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-[10px]",
                reached ? "bg-brand-600 text-white" : current ? "bg-white text-brand-700 ring-2 ring-brand-600" : "bg-ink-100 text-ink-500",
              )}
            >
              {reached ? <Check className="size-3" strokeWidth={3.5} aria-hidden /> : current ? <span className="size-2 rounded-full bg-brand-600" /> : null}
            </span>
            <span className={cn("ml-2 whitespace-nowrap text-xs", reached || current ? "font-medium text-ink-800" : "text-text-subtle")}>{s}</span>
            {i < steps.length - 1 ? <span aria-hidden className={cn("mx-3 h-px flex-1", i < at ? "bg-brand-600" : "bg-ink-200")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
