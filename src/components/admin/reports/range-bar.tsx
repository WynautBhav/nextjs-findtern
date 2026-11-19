import Link from "next/link";
import { CalendarRange } from "lucide-react";

import { DateRangeForm } from "@/components/admin/date-range-form";
import { reportHref } from "@/lib/admin/reports/href";
import type { ReportWindow } from "@/lib/admin/reports/window";
import { cn } from "@/lib/utils";

const VIEWS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
] as const;
const PRESETS = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "3 months" },
  { value: "365d", label: "Last 12 months" },
] as const;

const PILL = "apple-spring inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11";
const ON = "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]";
const OFF = "text-text-subtle hover:bg-[color:var(--admin-panel-2)] hover:text-foreground";

/**
 * The period control shared by every tab: Today, This week, This month (India days, week from Monday),
 * then the older presets, All time and a custom from-to. Each is a link that keeps the tab and every other
 * filter; changing the period drops each table's page number (`resetKeys`).
 */
export function RangeBar({ window: w, params, resetKeys = [] }: { window: ReportWindow; params: Record<string, string>; resetKeys?: string[] }) {
  const clear = ["range", "period", "from", "to", ...resetKeys];
  const href = (patch: Record<string, string>) => reportHref(params, patch, clear);
  const keep = Object.fromEntries(Object.entries(params).filter(([k, v]) => v && !["from", "to", "period", "range", ...resetKeys].includes(k)));
  const custom = w.kind === "custom";
  const item = (label: string, patch: Record<string, string>, on: boolean) => (
    <Link key={label} href={href(patch)} scroll={false} aria-current={on ? "page" : undefined} className={cn(PILL, on ? ON : OFF)}>
      {label}
    </Link>
  );
  // relative z-20 on the root: the page animates its blocks into stacking contexts, which paint over the open
  // Custom range panel otherwise (S-2). It stays under the sticky header (z-30).
  return (
    <div className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2" data-rp="period">
      <nav aria-label="Period" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[color:var(--admin-panel)] p-1 shadow-[var(--admin-shadow)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {VIEWS.map((v) => item(v.label, { range: v.value }, w.kind === v.value))}
        <span aria-hidden className="mx-1 my-2 w-px shrink-0 bg-[color:var(--admin-rule)]" />
        {PRESETS.map((p) => item(p.label, { period: p.value }, w.kind === "preset" && w.param.period === p.value))}
        {item("All time", { range: "all" }, w.kind === "all")}
      </nav>
      <details className="group relative" open={custom || undefined}>
        <summary
          className={cn(
            "apple-spring inline-flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-full px-4 text-sm font-medium shadow-[var(--admin-shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden",
            custom ? ON : "bg-[color:var(--admin-panel)] text-foreground hover:bg-[color:var(--admin-panel-2)]",
          )}
        >
          <CalendarRange className="size-4" aria-hidden />
          Custom range
        </summary>
        <div className="mt-2 rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel)] p-4 shadow-[var(--admin-shadow)] sm:absolute sm:left-0 sm:z-20 sm:w-max">
          <DateRangeForm params={{ ...keep, from: params.from ?? "", to: params.to ?? "" }} drop={["period", "range", ...resetKeys]} />
        </div>
      </details>
      <p className="text-sm text-text-subtle" data-rp="window-label">
        Showing <span className="font-medium text-foreground">{w.label}</span> (India time{w.kind === "week" ? ", week from Monday" : ""})
      </p>
    </div>
  );
}
