import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { FlowScroll } from "@/components/employer/hire-flow-scroll";
import { currentStepKey, type FlowPage, type FlowStepKey } from "@/lib/employer-flow-steps";

export type HireFlowCounts = {
  shortlisted: number;
  awaitingReply: number;
  toPay: number;
  hired: number;
};

type Step = { key: FlowStepKey; label: string; hint: string; href: string };

const STEPS: Step[] = [
  { key: "candidates", label: "Candidates", hint: "find and compare", href: "/employer/candidates" },
  { key: "shortlisted", label: "Shortlist", hint: "meet, then propose", href: "/employer/cart" },
  { key: "awaitingReply", label: "Proposed", hint: "candidate decides", href: "/employer/proposals" },
  { key: "toPay", label: "Accepted", hint: "pay to complete", href: "/employer/checkout" },
  { key: "hired", label: "Hired", hint: "placement running", href: "/employer/orders" },
];

/**
 * Candidates → shortlist → proposal → checkout → hire as one visible flow (DESIGN.md §7.4).
 * The cart and the checkout used to be two unrelated pages; this strip sits
 * on both, says where each candidate is and links every stage, so paying
 * reads as the last step of the shortlist rather than a separate shop.
 */
export function HireFlow({ counts, current, currentCount = null }: { counts: HireFlowCounts; current: FlowPage | null; /** A count for the current step when it has none of its own (Candidates: the list total). */ currentCount?: number | null }) {
  const currentKey = currentStepKey(current);
  // One line, not four cards: it says where the page sits in the flow and
  // links each stage, without competing with the page's own content.
  return (
    <nav aria-label="Hiring steps" className="relative mb-3 sm:mb-5 sm:rounded-xl sm:border sm:border-ink-200 sm:bg-white sm:p-1.5 sm:shadow-xs">
      <FlowScroll className="relative flex items-center gap-x-0 gap-y-1 overflow-x-auto text-[13px] max-sm:-m-1.5 max-sm:p-1.5 [scrollbar-width:none] sm:flex-wrap sm:gap-x-1.5 sm:gap-y-2 sm:overflow-visible sm:text-sm [&::-webkit-scrollbar]:hidden">
        {STEPS.map((s) => {
          const active = s.key === currentKey;
          // Finding candidates is the start of the path, not a queue: no count.
          const n = s.key === "candidates" ? (active ? currentCount : null) : counts[s.key];
          return (
            <li key={s.key} className="flex shrink-0 items-center gap-1">
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                title={s.hint}
                className={cn(
                  "apple-spring inline-flex min-h-10 items-center gap-1 whitespace-nowrap rounded-full px-2 sm:gap-2.5 sm:rounded-lg sm:border sm:px-4 touch:min-h-11",
                  active ? "bg-brand-50 font-semibold text-brand-800 sm:border-ink-200 sm:bg-ink-100 sm:text-ink-900 sm:shadow-xs" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900 sm:border-transparent",
                )}
              >
                {s.key === "hired" && n !== null && n > 0 && !active ? <Check className="size-3.5" aria-hidden /> : null}
                {s.label}
                {n === null ? null : <span className={cn("nums", active ? "text-brand-700 sm:rounded-full sm:bg-white sm:px-2 sm:py-0.5 sm:text-xs sm:font-bold sm:text-ink-900" : "text-text-subtle")}>{n}</span>}
              </Link>
            </li>
          );
        })}
      </FlowScroll>
    </nav>
  );
}
