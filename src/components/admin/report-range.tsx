import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { PERIOD_OPTIONS } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

const dateInput =
  "h-9 rounded-apple-sm border border-ink-200 bg-white px-2.5 text-sm text-ink-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 max-lg:h-11";

/**
 * A plain GET form for a custom from-to range. Every other query value is
 * carried as a hidden field, so applying dates keeps the search and filters
 * (and drops the page number, which would point past the narrowed list).
 */
export function DateRangeForm({
  params,
  fromKey = "from",
  toKey = "to",
  drop = [],
  label = "Apply dates",
  className,
}: {
  params: Record<string, string>;
  fromKey?: string;
  toKey?: string;
  /** Extra keys to drop when the range changes (e.g. a preset period). */
  drop?: string[];
  label?: string;
  className?: string;
}) {
  const skip = new Set([fromKey, toKey, "page", ...drop]);
  return (
    <form method="get" className={cn("flex flex-wrap items-end gap-2", className)}>
      {Object.entries(params)
        .filter(([k, v]) => !skip.has(k) && v)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
        From
        <input type="date" name={fromKey} defaultValue={params[fromKey] ?? ""} className={dateInput} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
        To
        <input type="date" name={toKey} defaultValue={params[toKey] ?? ""} className={dateInput} />
      </label>
      <button type="submit" className={cn(buttonClass({ variant: "outline", size: "sm" }), "max-lg:h-11")}>
        {label}
      </button>
    </form>
  );
}

/** Segmented links (period presets, source switches) in one style. */
export function ChipLinks({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; current: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((o) => (
        <Link
          key={o.href + o.label}
          href={o.href}
          scroll={false}
          aria-current={o.current ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-medium max-lg:min-h-11",
            o.current ? "bg-brand-800 text-white" : "bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** Period chips plus a custom from-to range, shared by the report pages. */
export function ReportRange({
  basePath,
  params,
  defaultLabel,
  hidden = {},
}: {
  basePath: string;
  params: Record<string, string>;
  /** Label for the no-period option (the page's default range). */
  defaultLabel: string;
  /** Other query values to keep when the range changes. */
  hidden?: Record<string, string | undefined>;
}) {
  const keep = Object.fromEntries(Object.entries(hidden).filter((e): e is [string, string] => Boolean(e[1])));
  const href = (period: string) => {
    const q = new URLSearchParams({ ...keep, ...(period ? { period } : {}) }).toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  const current = params.from || params.to ? "custom" : (params.period ?? "");
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <ChipLinks
        label="Period"
        items={[{ value: "", label: defaultLabel }, ...PERIOD_OPTIONS, { value: "all", label: "All time" }].map((o) => ({
          href: href(o.value),
          label: o.label,
          current: current === o.value,
        }))}
      />
      <DateRangeForm params={{ ...keep, from: params.from ?? "", to: params.to ?? "" }} label="Apply range" />
    </div>
  );
}
