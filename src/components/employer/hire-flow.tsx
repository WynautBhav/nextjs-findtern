import Link from "next/link";

import { cn } from "@/lib/utils";
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
    <nav aria-label="Hiring steps" className="relative mb-4 rounded-xl border border-brand-200 bg-brand-100/60 p-1 sm:mb-5">
      {/* Phones: three steps, then two, each row filling the width. Nothing scrolls, so no step is ever cut off at the edge. */}
      <ol className="grid grid-cols-6 items-stretch gap-1 text-[13px] sm:flex sm:text-sm">
        {STEPS.map((s, i) => {
          const active = s.key === currentKey;
          // Finding candidates is the start of the path, not a queue: no count.
          const n = s.key === "candidates" ? (active ? currentCount : null) : counts[s.key];
          return (
            <li key={s.key} className={cn("flex min-w-0 sm:flex-1", i < 3 ? "col-span-2" : "col-span-3")}>
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                title={s.hint}
                className={cn(
                  "apple-spring inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 sm:min-h-10 sm:gap-2 sm:px-4 sm:touch:min-h-11",
                  active ? "bg-white font-bold text-brand-900 shadow-sm ring-1 ring-brand-200" : "font-medium text-ink-700 hover:bg-white/60 hover:text-ink-900",
                )}
              >
                {s.label}
                {/* One badge for every count; the selected step's is the filled one. */}
                {n === null ? null : <span className={cn("nums min-w-5 rounded-full px-1.5 py-px text-center text-xs font-bold", active ? "bg-brand-700 text-white" : "bg-white text-ink-700 ring-1 ring-brand-200")}>{n}</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
