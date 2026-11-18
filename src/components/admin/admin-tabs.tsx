"use client";

import { useRef } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * AdminTabs - underline tabs for a page or a record.
 *
 * Two modes, picked per item:
 *  - Link tabs (`href` set): a `<nav>` of links; the active one has `aria-current="page"`.
 *    Safe to render from a server component.
 *  - Button tabs (no `href`): a `role="tablist"` of `role="tab"` buttons driven by
 *    `active` + `onSelect` (client components only). Roving focus: only the active tab is
 *    in the tab order; Left/Right/Home/End move focus and select.
 *
 * The active tab gets a 2px brand underline the width of the tab, semi-bold ink text; the
 * rest are muted, all on one full-width faint rule. A row too wide for a phone scrolls
 * sideways. Tabs are 44px tall.
 */

export type AdminTabItem = {
  /** Stable id, matched against `active` and passed to `onSelect`. */
  key: string;
  label: string;
  /** Count chip after the label (0 is shown). */
  count?: number | string;
  /** Makes this a link tab. */
  href?: string;
  /** Button tabs: the id of the panel this tab controls (`aria-controls`). */
  controls?: string;
};

export type AdminTabsProps = {
  items: AdminTabItem[];
  /** Key of the selected tab. */
  active: string;
  /** Button tabs: called with the key when a tab is chosen. */
  onSelect?: (key: string) => void;
  /** Names the tab row for assistive tech, e.g. "Intern sections". */
  label: string;
  className?: string;
};

const TAB_BASE =
  "relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-0.5 text-sm transition-colors " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring " +
  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']";

function tabClass(selected: boolean) {
  return cn(
    TAB_BASE,
    selected
      ? "font-semibold text-foreground after:bg-[color:var(--admin-tile)]"
      : "font-medium text-text-subtle hover:text-foreground after:bg-transparent",
  );
}

function Count({ value, selected }: { value: number | string; selected: boolean }) {
  return (
    <span
      className={cn(
        "nums inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium",
        selected
          ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]"
          : "bg-[color:var(--admin-rule)] text-ink-700",
      )}
    >
      {typeof value === "number" ? value.toLocaleString("en-IN") : value}
    </span>
  );
}

const ROW =
  "flex gap-4 overflow-x-auto pe-4 shadow-[inset_0_-1px_0_var(--admin-rule)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-6";

export function AdminTabs({ items, active, onSelect, label, className }: AdminTabsProps) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const linkMode = items.some((item) => item.href);

  if (linkMode) {
    return (
      <nav aria-label={label} className={cn(ROW, className)}>
        {items.map((item) => {
          const selected = item.key === active;
          const content = (
            <>
              {item.label}
              {item.count !== undefined ? <Count value={item.count} selected={selected} /> : null}
            </>
          );
          return item.href ? (
            <Link
              key={item.key}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              className={tabClass(selected)}
            >
              {content}
            </Link>
          ) : null;
        })}
      </nav>
    );
  }

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === active),
  );

  function move(to: number) {
    const index = (to + items.length) % items.length;
    refs.current[index]?.focus();
    onSelect?.(items[index].key);
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowRight") move(index + 1);
    else if (event.key === "ArrowLeft") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <div role="tablist" aria-label={label} className={cn(ROW, className)}>
      {items.map((item, index) => {
        const selected = item.key === active;
        return (
          <button
            key={item.key}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={item.controls}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => onSelect?.(item.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={tabClass(selected)}
          >
            {item.label}
            {item.count !== undefined ? <Count value={item.count} selected={selected} /> : null}
          </button>
        );
      })}
    </div>
  );
}
