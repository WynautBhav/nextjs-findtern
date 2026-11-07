import Link from "next/link";

import { cn } from "@/lib/utils";

type Tab = { key: string; label: string; href: string; count?: number };

/**
 * Underline tabs on a full-width rule: the same look as the Schedule status
 * tabs and the Proposals filter. These move between sibling pages, so they
 * are links with aria-current, not a tablist.
 */
function SectionTabs({ label, tabs, active }: { label: string; tabs: Tab[]; active: string }) {
  return (
    <nav aria-label={label} className="mb-5 flex flex-wrap gap-x-5 border-b border-ink-100 sm:gap-x-7">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative -mb-px inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap text-sm outline-none transition-colors",
              "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']",
              "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent",
              on ? "font-semibold text-ink-900 after:bg-brand-700" : "font-medium text-ink-600 hover:text-ink-900",
            )}
          >
            {t.label}
            {t.count === undefined ? null : <span className={cn("nums", on ? "text-ink-900" : "text-text-subtle")}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Candidates | Shortlist (n) | Compare (n): the three places you pick from. */
export function CandidateTabs({ active, shortlist, compare }: { active: "candidates" | "shortlist" | "compare"; shortlist: number; compare: number }) {
  return (
    <SectionTabs
      label="Candidates"
      active={active}
      tabs={[
        { key: "candidates", label: "Candidates", href: "/employer/candidates" },
        { key: "shortlist", label: "Shortlist", href: "/employer/cart", count: shortlist },
        { key: "compare", label: "Compare", href: "/employer/compare", count: compare },
      ]}
    />
  );
}

/** Proposals | Interviews: the offer and the meeting that precedes it. */
export function ProposalTabs({ active }: { active: "proposals" | "interviews" }) {
  return (
    <SectionTabs
      label="Proposals and interviews"
      active={active}
      tabs={[
        { key: "proposals", label: "Proposals", href: "/employer/proposals" },
        { key: "interviews", label: "Interviews", href: "/employer/schedule" },
      ]}
    />
  );
}
