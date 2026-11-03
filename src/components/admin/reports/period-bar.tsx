import Link from "next/link";
import { CalendarRange } from "lucide-react";

import { DateRangeForm } from "@/components/admin/date-range-form";
import { PERIOD_OPTIONS } from "@/lib/admin/params";
import { activePeriod } from "@/lib/admin/reports-shape";
import { cn } from "@/lib/utils";

/**
 * The one period control for a report: a segmented pill row of links plus a
 * "Custom" disclosure holding the from-to dates. Server-rendered; the dates
 * form is the existing client component. `hidden` carries other query values
 * (filters, tabs) across a period change.
 */
export function PeriodBar({
  basePath,
  params,
  defaultValue,
  defaultLabel,
  includeAll = true,
  hidden = {},
}: {
  basePath: string;
  params: Record<string, string>;
  /** Value of the option shown when the URL has no period ("" for the page default). */
  defaultValue: string;
  defaultLabel: string;
  /** Add an explicit "All time" option (pages whose default is not all time). */
  includeAll?: boolean;
  hidden?: Record<string, string | undefined>;
}) {
  const keep = Object.fromEntries(Object.entries(hidden).filter((e): e is [string, string] => Boolean(e[1])));
  const options = [
    { value: defaultValue, label: defaultLabel },
    ...PERIOD_OPTIONS.filter((o) => o.value !== defaultValue),
    ...(includeAll && defaultValue !== "all" ? [{ value: "all", label: "All time" }] : []),
  ];
  const current = activePeriod(params, defaultValue);
  const href = (value: string) => {
    const q = new URLSearchParams({ ...keep, ...(value && value !== defaultValue ? { period: value } : {}) }).toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  const custom = current === "custom";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-rp="period">
      <nav
        aria-label="Period"
        className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[color:var(--admin-panel)] p-1 shadow-[var(--admin-shadow)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {options.map((o) => {
          const on = current === o.value;
          return (
            <Link
              key={o.value || "default"}
              href={href(o.value)}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "apple-spring inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11",
                on ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "text-text-subtle hover:bg-[color:var(--admin-panel-2)] hover:text-foreground",
              )}
            >
              {o.label}
            </Link>
          );
        })}
      </nav>
      <details className="group relative" open={custom || undefined}>
        <summary
          className={cn(
            "apple-spring inline-flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-full px-4 text-sm font-medium shadow-[var(--admin-shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden",
            custom ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "bg-[color:var(--admin-panel)] text-foreground hover:bg-[color:var(--admin-panel-2)]",
          )}
        >
          <CalendarRange className="size-4" aria-hidden />
          Custom range
        </summary>
        <div className="mt-2 rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel)] p-4 shadow-[var(--admin-shadow)] sm:absolute sm:left-0 sm:z-20 sm:w-max">
          <DateRangeForm params={{ ...keep, from: params.from ?? "", to: params.to ?? "" }} drop={["period"]} />
        </div>
      </details>
    </div>
  );
}
