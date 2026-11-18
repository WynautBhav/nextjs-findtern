import Link from "next/link";
import { AlertTriangle, Check, Clock, X } from "lucide-react";

import { PageSizeSelect } from "@/components/admin/page-size-select";
import { TableToolbar, type ToolbarFilter } from "@/components/admin/table-toolbar";
import type { SortOption } from "@/components/admin/sort-select";
import { Pill } from "@/components/app/primitives";
import { UserDot } from "@/components/layout/shell-parts";
import { cn } from "@/lib/utils";

const LINK = "rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A person (or placement) cell: flat ink initials, the name as a link, one quiet line under it. */
export function Person({ name, href, sub, className }: { name: string; href: string; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-start gap-3", className)}>
      <UserDot name={name} className="mt-0.5 size-8" />
      <div className="min-w-0">
        <Link href={href} className={cn("block truncate font-medium text-ink-900", LINK)}>
          {name}
        </Link>
        {sub ? <span className="block text-sm font-normal text-ink-600">{sub}</span> : null}
      </div>
    </div>
  );
}

export const subLink = LINK;

/** Payout status as a flat chip with a glyph, never colour alone. */
export function PayoutStatus({ status }: { status: string }) {
  if (status === "paid") return <Pill tone="paid" icon={<Check aria-hidden />}>Paid</Pill>;
  if (status === "failed") return <Pill tone="neutral" className="bg-danger-soft text-danger" icon={<X aria-hidden />}>Failed</Pill>;
  return <Pill tone="waiting" icon={<Clock aria-hidden />}>Pending</Pill>;
}

/** A warning line with its glyph (an employer month not paid yet, say). */
export function Flag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 flex items-start gap-1.5 text-xs font-medium text-signal">
      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

/**
 * Search, filters, CSV and rows-per-page for a list, over the URL (the same behaviour the DataTable toolbar
 * had), laid out flat above a ruled ledger instead of inside a card.
 */
export function PoToolbar({
  searchPlaceholder,
  filters,
  exportHref,
  extra,
  sortOptions,
}: {
  searchPlaceholder: string;
  filters?: ToolbarFilter[];
  exportHref?: string;
  extra?: React.ReactNode;
  sortOptions?: SortOption[];
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 max-sm:basis-full">
        <TableToolbar searchPlaceholder={searchPlaceholder} filters={filters} exportHref={exportHref} extra={extra} sortOptions={sortOptions} />
      </div>
      <PageSizeSelect />
    </div>
  );
}
