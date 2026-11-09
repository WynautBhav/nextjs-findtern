import { Count } from "@/components/admin/motion/count";
import { Reveal } from "@/components/admin/motion/reveal";
import type { Activity as ActivityData, ActivityWeek } from "@/lib/employer-dashboard";
import { cn } from "@/lib/utils";

import { ChartCard } from "./chart-card";

/** `activity.weeks` is always 8 entries, oldest first. `activeWeeks < 2`: draw the fallback (figure plus tick row). */
export type ActivityProps = { activity: ActivityData };

const PLOT = 112; // tallest column, px
const MAX_DOTS = 3; // more hires than this in one week print as a number

/** A hire is a dot; a busy week is a number so the stack never outgrows the card. */
function Hires({ n, pin = false }: { n: number; pin?: boolean }) {
  if (n === 0) return null;
  const lift = pin ? "relative z-10 mt-2 -mb-1" : "";
  if (n > MAX_DOTS) return <span aria-hidden className={cn("nums grid size-5 place-items-center rounded-full bg-brand-700 text-xs font-semibold leading-none text-white ring-2 ring-white", lift)}>{n}</span>;
  return (
    <span aria-hidden className={cn("flex flex-col items-center gap-1.5", lift)}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="size-2 rounded-full bg-brand-700 ring-2 ring-white" />
      ))}
    </span>
  );
}

/** Every second label, ending on the current week, so 8 dates fit a 4-column card. */
const labelled = (i: number) => i % 2 === 1;

function weekSummary(w: ActivityWeek) {
  const sent = `${w.sent} ${w.sent === 1 ? "proposal" : "proposals"} sent`;
  const hires = `${w.hires} ${w.hires === 1 ? "hire" : "hires"}`;
  return `Week of ${w.label}${w.current ? " (this week)" : ""}: ${sent}, ${hires}`;
}

/**
 * Hiring activity: proposals sent in each of the last 8 India weeks as ink
 * columns with square tops, one brand dot per hire on the column, the current
 * week outlined. With fewer than two active weeks a column chart says nothing,
 * so the card shows the figure and a tick row (same call as the admin week panel).
 */
export function Activity({ activity }: ActivityProps) {
  const { weeks, totalSent, totalHires, activeWeeks } = activity;
  const max = Math.max(1, ...weeks.map((w) => w.sent));
  const sparse = activeWeeks < 2;
  const sentWeek = weeks.find((w) => w.sent > 0);
  const hires = `${totalHires} ${totalHires === 1 ? "hire" : "hires"}`;
  const summary =
    totalSent === 0 && totalHires === 0
      ? "Your first proposal will show here"
      : sparse && sentWeek
        ? `All sent in the week of ${sentWeek.label}${totalHires ? `, ${hires}` : ""}`
        : `${hires} in 8 weeks`;

  return (
    <ChartCard title="Hiring activity" titleId="activity-title" description="Last 8 weeks, Monday to Sunday, India time" link={{ href: "/employer/proposals", label: "Open proposals" }}>
      <div className="mt-4 flex items-baseline gap-2">
        <Count value={totalSent} className="nums text-[2rem] font-normal leading-10 tracking-[-0.03em] tabular-nums text-ink-900" />
        <span className="text-sm text-text-subtle">sent in 8 weeks</span>
      </div>
      <p className="text-sm text-text-subtle">{summary}</p>

      {sparse ? (
        <ol aria-label="Last 8 weeks" className="mt-auto grid grid-cols-8 gap-1.5 pt-6">
          {weeks.map((w, i) => (
            <li key={w.start} className="flex flex-col items-center text-center">
              <span className="flex h-4 items-end"><Hires n={w.hires} /></span>
              <span
                aria-hidden
                className={cn(
                  "mt-1 block h-2 w-full rounded-full",
                  w.sent > 0 ? "bg-ink-300" : "border border-dashed border-ink-300",
                  w.current && "ring-2 ring-brand-700 ring-offset-2",
                )}
              />
              <span aria-hidden className={cn("mt-2 flex h-4 justify-center whitespace-nowrap text-xs", w.current ? "font-semibold text-ink-900" : "text-text-subtle")}>{labelled(i) ? w.label : ""}</span>
              <span className="sr-only">{weekSummary(w)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <div role="img" aria-label={`Proposals sent per week, last 8 weeks: ${weeks.map((w) => `${w.label} ${w.sent}`).join(", ")}`} className="mt-auto pt-5">
            <ol aria-hidden className="grid grid-cols-8 items-end gap-1.5">
              {weeks.map((w, i) => (
                <li key={w.start} className={cn("flex h-48 flex-col items-center justify-end rounded-lg border border-transparent px-0.5 pb-1.5", w.current && "border border-dashed border-ink-400")}>
                  {w.sent > 0 ? <span className="nums text-xs leading-4 text-ink-900">{w.sent}</span> : null}
                  <Hires n={w.hires} pin />
                  <Reveal axis="y" index={i} className={cn("w-full", w.sent > 0 ? "border-t-2 border-ink-500 bg-ink-300" : "bg-ink-200")} style={{ height: w.sent > 0 ? Math.max(4, Math.round((w.sent / max) * PLOT)) : 2 }} />
                </li>
              ))}
            </ol>
            <ol aria-hidden className="mt-1 grid grid-cols-8 gap-1.5">
              {weeks.map((w, i) => (
                <li key={w.start} className={cn("flex h-4 justify-center whitespace-nowrap text-xs", w.current ? "font-semibold text-ink-900" : "text-text-subtle")}>
                  {labelled(i) ? w.label : null}
                </li>
              ))}
            </ol>
          </div>
          {/* The wrapper is the sr-only box: on a <table> itself the 1px width is only a minimum and the caption sits outside the table's clip, so it printed over the card header. */}
          <div className="sr-only">
            <table>
              <caption>Proposals sent and hires per week, oldest first</caption>
              <thead>
                <tr><th scope="col">Week of</th><th scope="col">Proposals sent</th><th scope="col">Hires</th></tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.start}><th scope="row">{w.label}{w.current ? " (this week)" : ""}</th><td>{w.sent}</td><td>{w.hires}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-2.5 bg-ink-300" />Proposals sent</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-brand-700" />Hire</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-[4px] border border-dashed border-ink-400" />This week, so far</li>
      </ul>
    </ChartCard>
  );
}
