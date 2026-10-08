/**
 * Employer timesheet presentation bits.
 *
 * The normalisation itself lives in `lib/employer-timesheets.ts` so it can be
 * unit-tested — see the `node --test` script in package.json. This file is only
 * the rendering half.
 *
 * A `page.tsx` may only export the page, `metadata`, and route config, so the
 * shared `StatusPill` cannot live next to either timesheet page.
 */

export {
  DAY_STATUSES,
  countClaimed,
  countStatuses,
  formatDay,
  formatPeriod,
  normaliseEntries,
} from "@/lib/employer-timesheets";

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "bg-success-soft text-success"
      : status === "rejected"
        ? "bg-danger-soft text-danger"
        : status === "submitted"
          ? "bg-warning-soft text-warning"
          : "bg-ink-100 text-ink-600";
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
