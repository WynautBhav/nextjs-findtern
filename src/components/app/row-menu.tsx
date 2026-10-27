"use client";

/**
 * The "⋯" menu at the end of a list row: the row's secondary actions, so a
 * list shows one visible action per row instead of the same three buttons
 * repeated down the page. Built on the Radix dropdown, which gives the menu
 * semantics, roving focus with the arrow keys, typeahead and Esc to close.
 *
 * Destructive items come last, after a separator, and are coloured danger.
 * Confirmation stays with the caller (`onSelect` opens its own dialog).
 */

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RowMenuItem = {
  label: string;
  icon?: React.ReactNode;
  /** A link, or… */
  href?: string;
  /** …an action. */
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export function RowMenu({
  label,
  items,
  className,
}: {
  /** What the menu is about, for screen readers: "More actions for Frontend Intern". */
  label: string;
  items: RowMenuItem[];
  className?: string;
}) {
  const shown = items.filter(Boolean);
  if (shown.length === 0) return null;
  const safe = shown.filter((i) => !i.destructive);
  const danger = shown.filter((i) => i.destructive);

  const item = (i: RowMenuItem) => {
    const cls = cn(
      "flex min-h-10 cursor-pointer items-center gap-2.5 text-sm [&_svg]:size-4",
      i.destructive ? "text-danger focus:bg-danger-soft focus:text-danger [&_svg]:text-danger" : "[&_svg]:text-text-subtle",
    );
    return i.href ? (
      <DropdownMenuItem key={i.label} asChild disabled={i.disabled}>
        <Link href={i.href} className={cls}>
          {i.icon}
          {i.label}
        </Link>
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem key={i.label} disabled={i.disabled} onSelect={i.onSelect} className={cls}>
        {i.icon}
        {i.label}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "apple-spring grid size-10 shrink-0 place-items-center rounded-apple-sm text-text-subtle hover:bg-ink-100 hover:text-ink-900 data-[state=open]:bg-ink-100 data-[state=open]:text-ink-900",
            className,
          )}
        >
          <MoreHorizontal className="size-5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 p-1.5">
        {safe.map(item)}
        {safe.length && danger.length ? <DropdownMenuSeparator /> : null}
        {danger.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
