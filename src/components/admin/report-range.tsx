import Link from "next/link";

import { DateRangeForm } from "@/components/admin/date-range-form";
import { PERIOD_OPTIONS } from "@/lib/admin/params";
import { pillTabClass } from "@/components/app/primitives";

// The date filter is a client component (DD/MM/YYYY, applies itself);
// re-exported so the report pages keep importing it from here.
export { DateRangeForm } from "@/components/admin/date-range-form";

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
          className={pillTabClass(o.current)}
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
      <DateRangeForm params={{ ...keep, from: params.from ?? "", to: params.to ?? "" }} drop={["period"]} />
    </div>
  );
}
