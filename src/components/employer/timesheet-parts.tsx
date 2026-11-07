/**
 * Employer timesheet presentation bits.
 *
 * The normalisation itself lives in `lib/employer-timesheets.ts` so it can be
 * unit-tested - see the `node --test` script in package.json. This file is only
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

import { CheckCircle2, CircleDashed, Hourglass, XCircle } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { timesheetPill } from "@/components/app/status";

export function StatusPill({ status }: { status: string }) {
  const s = timesheetPill(status);
  const Icon = s.tone === "paid" || s.tone === "live" ? CheckCircle2 : s.tone === "closed" ? XCircle : s.tone === "waiting" ? Hourglass : CircleDashed;
  return (
    <Pill tone={s.tone} icon={<Icon />}>
      {s.label}
    </Pill>
  );
}
