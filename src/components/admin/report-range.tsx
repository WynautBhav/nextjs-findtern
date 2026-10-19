import Link from "next/link";

import { PERIOD_OPTIONS } from "@/lib/admin/params";

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
    <nav aria-label="Period" className="flex flex-wrap gap-1.5">
      {[{ value: "", label: defaultLabel }, ...PERIOD_OPTIONS, { value: "all", label: "All time" }].map((o) => (
        <Link
          key={o.value}
          href={href(o.value)}
          aria-current={current === o.value ? "page" : undefined}
          className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-medium max-lg:min-h-11 ${
            current === o.value ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50"
          }`}
        >
          {o.label}
        </Link>
      ))}
      <form method="get" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-600">
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="inline-flex items-center gap-1">
          From
          <input type="date" name="from" defaultValue={params.from ?? ""} className="h-9 rounded-lg border border-ink-200 px-2 text-sm" />
        </label>
        <label className="inline-flex items-center gap-1">
          To
          <input type="date" name="to" defaultValue={params.to ?? ""} className="h-9 rounded-lg border border-ink-200 px-2 text-sm" />
        </label>
        <button type="submit" className="h-9 rounded-full bg-white px-3 font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
          Apply range
        </button>
      </form>
    </nav>
  );
}
