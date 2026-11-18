import Link from "next/link";

import { cn } from "@/lib/utils";
import type { HireFlowCounts } from "@/components/employer/proposal-bucket";
import { currentStepKey, type FlowPage, type FlowStepKey } from "@/lib/employer-flow-steps";

type Step = { key: FlowStepKey; label: string; hint: string; href: string };

const STEPS: Step[] = [
  { key: "candidates", label: "Candidates", hint: "find and compare", href: "/employer/candidates" },
  { key: "shortlisted", label: "Shortlist", hint: "meet, then propose", href: "/employer/cart" },
  { key: "awaitingReply", label: "Waiting", hint: "proposals waiting on the candidate", href: "/employer/proposals?status=open" },
  { key: "verifying", label: "Verifying", hint: "accepted, Findtern is confirming the candidate's CGPA", href: "/employer/proposals?status=verifying" },
  { key: "toPay", label: "To pay", hint: "accepted and ready for your payment", href: "/employer/checkout" },
  { key: "hired", label: "Hired", hint: "placement running", href: "/employer/orders" },
];

/**
 * The hiring funnel as one ruled line: every stage a link, its figure in
 * display numerals, a stage with nobody in it left without a number (the link
 * stays, so the path is never hidden). The current stage is underlined; money
 * waiting on you (To pay) takes the signal colour. Same stages, links and
 * counting rules as the HireFlow strip other pages use.
 */
export function StageTrail({ counts, current, currentCount = null }: { counts: HireFlowCounts; current: FlowPage | null; currentCount?: number | null }) {
  const currentKey = currentStepKey(current);
  return (
    <nav aria-label="Hiring steps" className="border-y border-ink-200">
      <ol className="flex flex-wrap items-center gap-x-1 sm:gap-x-2">
        {STEPS.map((s, i) => {
          const active = s.key === currentKey;
          // Finding candidates is the start of the path, not a queue: its figure is this list's total.
          const n = s.key === "candidates" ? (active ? currentCount : null) : counts[s.key];
          return (
            <li key={s.key} className="flex items-center">
              {i > 0 ? <span aria-hidden className="mr-1 h-px w-3 bg-ink-300 sm:mr-2 sm:w-5" /> : null}
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                title={s.hint}
                className={cn(
                  "relative inline-flex min-h-11 items-baseline gap-1.5 whitespace-nowrap rounded-md px-1.5 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-2",
                  active ? "font-semibold text-ink-900" : "font-medium text-ink-700 hover:text-ink-900",
                  active && "after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-sm after:bg-ink-900 after:content-[''] sm:after:inset-x-2",
                )}
              >
                {s.label}
                {n ? (
                  <span className={cn("nums font-display text-base font-semibold leading-none", s.key === "toPay" ? "text-signal" : active ? "text-brand-800" : "text-ink-900")}>
                    {n}
                    {s.key === "toPay" ? <span className="sr-only"> waiting for your payment</span> : null}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
