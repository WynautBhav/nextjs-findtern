import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Candidates | Shortlist (n) | Compare (n): the three places you pick from, as one ruled line with the current
 * place underlined. They move between sibling pages, so they are links with aria-current, not a tablist.
 * A place with nobody in it carries no number.
 */
export function CompareTabs({ shortlist, compare }: { shortlist: number; compare: number }) {
  const tabs = [
    { key: "candidates", label: "Candidates", href: "/employer/candidates", count: undefined },
    { key: "shortlist", label: "Shortlist", href: "/employer/cart", count: shortlist },
    { key: "compare", label: "Compare", href: "/employer/compare", count: compare },
  ];
  return (
    <nav aria-label="Candidates" className="mb-6 border-b border-ink-200">
      <ul className="flex items-center gap-6">
        {tabs.map((t) => {
          const on = t.key === "compare";
          return (
            <li key={t.key} className="flex">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 items-baseline gap-1.5 whitespace-nowrap rounded-sm py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
                  on ? "font-semibold text-ink-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink-900 after:content-['']" : "font-medium text-ink-700 hover:text-ink-900",
                )}
              >
                {t.label}
                {t.count ? <span className={cn("nums font-display text-base font-semibold", on ? "text-brand-800" : "text-ink-900")}>{t.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
