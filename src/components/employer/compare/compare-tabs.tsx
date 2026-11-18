import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Candidates | Shortlist (n) | Compare (n): the three places you pick from, as
 * the same green strip with a white selected step the Candidates page's
 * hiring-steps strip uses. They move between sibling pages, so they are links
 * with aria-current, not a tablist.
 */
export function CompareTabs({ shortlist, compare }: { shortlist: number; compare: number }) {
  const tabs = [
    { key: "candidates", label: "Candidates", href: "/employer/candidates", count: undefined },
    { key: "shortlist", label: "Shortlist", href: "/employer/cart", count: shortlist },
    { key: "compare", label: "Compare", href: "/employer/compare", count: compare },
  ];
  return (
    <nav aria-label="Candidates" className="mb-4 rounded-xl border border-brand-200 bg-brand-100/60 p-1 sm:mb-5">
      <ul className="grid grid-cols-3 items-stretch gap-1 text-[13px] sm:text-sm">
        {tabs.map((t) => {
          const on = t.key === "compare";
          return (
            <li key={t.key} className="flex min-w-0">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "apple-spring inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-10 sm:gap-2 sm:px-4 sm:touch:min-h-11",
                  on ? "bg-white font-bold text-brand-900 shadow-sm ring-1 ring-brand-200" : "font-medium text-ink-700 hover:bg-white/60 hover:text-ink-900",
                )}
              >
                {t.label}
                {t.count === undefined ? null : (
                  <span className={cn("nums min-w-5 rounded-full px-1.5 py-px text-center text-xs font-bold", on ? "bg-brand-700 text-white" : "bg-white text-ink-700 ring-1 ring-brand-200")}>{t.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
