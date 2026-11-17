"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export type ReportTabItem = { key: string; label: string; href: string };

import { REPORT_PANEL_ID, reportTabId } from "@/lib/admin/reports/tab-ids";

/**
 * The Reports tab row. Each tab is a link (so it works with no JS, opens in a new tab
 * and survives refresh: the tab lives in the URL), marked up as a WAI-ARIA tablist:
 * `role="tab"`, `aria-selected`, roving tabindex. Left/Right/Home/End move focus and
 * open the tab. A row too wide for a phone scrolls sideways; tabs are 44px tall.
 */
export function ReportTabs({ items, active, label = "Report sections" }: { items: ReportTabItem[]; active: string; label?: string }) {
  const router = useRouter();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const activeIndex = Math.max(0, items.findIndex((i) => i.key === active));

  function go(to: number) {
    const i = (to + items.length) % items.length;
    refs.current[i]?.focus();
    router.push(items[i].href, { scroll: false });
  }
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === "ArrowRight") go(i + 1);
    else if (e.key === "ArrowLeft") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-4 overflow-x-auto pe-4 shadow-[inset_0_-1px_0_var(--admin-rule)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-7" data-rp="tabs">
      {items.map((item, i) => {
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            ref={(n) => {
              refs.current[i] = n;
            }}
            id={reportTabId(item.key)}
            href={item.href}
            scroll={false}
            role="tab"
            aria-selected={selected}
            aria-controls={REPORT_PANEL_ID}
            tabIndex={i === activeIndex ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-0.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']",
              selected ? "font-semibold text-foreground after:bg-[color:var(--admin-tile)]" : "font-medium text-text-subtle after:bg-transparent hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
