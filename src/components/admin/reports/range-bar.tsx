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

const PILL = "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11";
const ON = "bg-ink-900 text-canvas";
const OFF = "text-ink-700 hover:bg-ink-200/60 hover:text-ink-900";

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
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-rp="period">
      <nav aria-label="Period" className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {VIEWS.map((v) => item(v.label, { range: v.value }, w.kind === v.value))}
        <span aria-hidden className="mx-1 my-2 w-px shrink-0 bg-ink-300" />
        {PRESETS.map((p) => item(p.label, { period: p.value }, w.kind === "preset" && w.param.period === p.value))}
        {item("All time", { range: "all" }, w.kind === "all")}
      </nav>
      <details className="group relative" open={custom || undefined}>
        <summary
          className={cn(
            "inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11 [&::-webkit-details-marker]:hidden",
            custom ? "border-ink-900 bg-ink-900 text-canvas" : "border-ink-300 text-ink-900 hover:bg-ink-100",
          )}
        >
          <CalendarRange className="size-4" aria-hidden />
          Custom range
        </summary>
        <div className="mt-2 rounded-lg border border-ink-200 bg-surface-raised p-4 shadow-[var(--shadow-float)] sm:absolute sm:left-0 sm:z-20 sm:w-max">
          <DateRangeForm params={{ ...keep, from: params.from ?? "", to: params.to ?? "" }} drop={["period", "range", ...resetKeys]} />
        </div>
      </details>
      <p className="text-sm text-ink-600" data-rp="window-label">
        Showing <span className="font-medium text-ink-900">{w.label}</span> (India time{w.kind === "week" ? ", week from Monday" : ""})
      </p>
    </div>
  );
}
