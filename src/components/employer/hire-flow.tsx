import Link from "next/link";
import { Check } from "lucide-react";

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
  return (
    <nav aria-label="Hiring steps" className="mb-8">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => {
          const active = s.key === currentKey;
          const n = counts[s.key];
          return (
            <li key={s.key} className="min-w-0">
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "apple-spring group flex h-full min-w-0 items-center gap-3 rounded-apple-lg border px-4 py-3",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-600/30",
                  active
                    ? "border-brand-700 bg-brand-700 text-white shadow-sm"
                    : "border-ink-200/80 bg-white text-ink-800 hover:border-brand-300",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "nums grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    active ? "bg-white/15 text-white" : n > 0 ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-500",
                  )}
                >
                  {s.key === "hired" && n > 0 && !active ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-1.5">
                    <span className="truncate text-sm font-semibold">{s.label}</span>
                    <span className={cn("nums text-sm", active ? "text-white/80" : "text-ink-500")}>{n}</span>
                  </span>
                  <span className={cn("block text-xs leading-snug", active ? "text-white/75" : "text-ink-500")}>{s.hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
