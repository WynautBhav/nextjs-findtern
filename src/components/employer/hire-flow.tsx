import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type HireFlowCounts = {
  shortlisted: number;
  awaitingReply: number;
  toPay: number;
  hired: number;
};

type Step = { key: keyof HireFlowCounts; label: string; hint: string; href: string };

const STEPS: Step[] = [
  { key: "shortlisted", label: "Shortlist", hint: "meet, then propose", href: "/employer/cart" },
  { key: "awaitingReply", label: "Proposed", hint: "candidate decides", href: "/employer/proposals" },
  { key: "toPay", label: "Accepted", hint: "pay to complete", href: "/employer/checkout" },
  { key: "hired", label: "Hired", hint: "placement running", href: "/employer/orders" },
];

/**
 * Cart → proposal → checkout → hire as one visible flow (DESIGN.md §7.4).
 * The cart and the checkout used to be two unrelated pages; this strip sits
 * on both, says where each candidate is and links every stage, so paying
 * reads as the last step of the shortlist rather than a separate shop.
 */
export function HireFlow({ counts, current }: { counts: HireFlowCounts; current: "cart" | "checkout" }) {
  const currentKey: Step["key"] = current === "cart" ? "shortlisted" : "toPay";
  // One line, not four cards: it says where the page sits in the flow and
  // links each stage, without competing with the page's own content.
  return (
    <nav aria-label="Hiring steps" className="mb-6">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {STEPS.map((s, i) => {
          const active = s.key === currentKey;
          const n = counts[s.key];
          return (
            <li key={s.key} className="flex items-center gap-1">
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                title={s.hint}
                className={cn(
                  "apple-spring inline-flex min-h-10 items-center gap-1.5 rounded-full px-3",
                  active ? "bg-brand-50 font-semibold text-brand-800" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                )}
              >
                {s.key === "hired" && n > 0 && !active ? <Check className="size-3.5" aria-hidden /> : null}
                {s.label}
                <span className={cn("nums", active ? "text-brand-700" : "text-text-subtle")}>{n}</span>
              </Link>
              {/* After the step, so a wrap never starts a line with a chevron (QA-124). */}
              {i < STEPS.length - 1 ? <ChevronRight className="size-4 shrink-0 text-ink-300" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
