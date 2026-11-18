import Link from "next/link";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { DateRangeForm } from "@/components/admin/date-range-form";
import { PERIOD_OPTIONS } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

// The date filter is a client component (DD/MM/YYYY, applies itself);
// re-exported so the report pages keep importing it from here.
export { DateRangeForm } from "@/components/admin/date-range-form";

/**
 * A small segmented set of links (a source switch, a status filter) in one
 * style: tonal pills, the current one filled with the brand tile colour.
 * For a page's own views or periods use `AdminTabs` instead.
 */
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
            "apple-spring inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11",
            o.current
              ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]"
              : "bg-[color:var(--admin-panel-2)] text-foreground hover:bg-[color:var(--admin-bar-tint)]",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** Period tabs plus a custom from-to range, shared by the report pages. */
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
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-80">
        <AdminTabs
          label="Period"
          active={current || "default"}
          items={[{ value: "", label: defaultLabel }, ...PERIOD_OPTIONS, { value: "all", label: "All time" }].map((o) => ({
            key: o.value || "default",
            label: o.label,
            href: href(o.value),
          }))}
        />
      </div>
      <DateRangeForm params={{ ...keep, from: params.from ?? "", to: params.to ?? "" }} drop={["period"]} />
    </div>
  );
}
