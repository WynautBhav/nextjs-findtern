import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";

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
export function HireFlow({ counts, current }: { counts: HireFlowCounts; current: FlowPage | null }) {
  const currentKey = currentStepKey(current);
  // One line, not four cards: it says where the page sits in the flow and
  // links each stage, without competing with the page's own content.
  return (
    <nav aria-label="Hiring steps" className="relative mb-3 sm:mb-6">
      <FlowScroll className="relative flex items-center gap-x-0 gap-y-1 overflow-x-auto text-[13px] max-sm:-m-1.5 max-sm:p-1.5 [scrollbar-width:none] sm:flex-wrap sm:gap-x-1 sm:gap-y-2 sm:overflow-visible sm:text-sm [&::-webkit-scrollbar]:hidden">
        {STEPS.map((s, i) => {
          const active = s.key === currentKey;
          // Finding candidates is the start of the path, not a queue: no count.
          const n = s.key === "candidates" ? null : counts[s.key];
          return (
            <li key={s.key} className="flex shrink-0 items-center gap-1">
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                title={s.hint}
                className={cn(
                  "apple-spring inline-flex min-h-10 items-center gap-1 whitespace-nowrap rounded-full sm:gap-1.5 px-2 sm:px-3 touch:min-h-11",
                  active ? "bg-brand-50 font-semibold text-brand-800" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                )}
              >
                {s.key === "hired" && n !== null && n > 0 && !active ? <Check className="size-3.5" aria-hidden /> : null}
                {s.label}
                {n === null ? null : <span className={cn("nums", active ? "text-brand-700" : "text-text-subtle")}>{n}</span>}
              </Link>
              {/* After the step, so a wrap never starts a line with a chevron (QA-124). */}
              {i < STEPS.length - 1 ? <ChevronRight className="size-4 shrink-0 text-ink-300 max-sm:hidden" aria-hidden /> : null}
            </li>
          );
        })}
      </FlowScroll>
    </nav>
  );
}
