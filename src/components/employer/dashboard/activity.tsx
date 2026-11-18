import Link from "next/link";

import { Count } from "@/components/admin/motion/count";
import { Reveal } from "@/components/admin/motion/reveal";
import { Section } from "@/components/app/stat";
import type { Activity as ActivityData } from "@/lib/employer-dashboard";
import { cn } from "@/lib/utils";

import { HATCH } from "./chart-card";

/** `activity.weeks` is always 8 entries, oldest first. */
export type ActivityProps = { activity: ActivityData };

const PLOT = 112; // tallest column, px

/**
 * Hiring activity as a two-line ledger over eight weeks: proposals sent as columns (the number
 * printed on each, a scale line at the tallest), and under them a row of hires per week. The
 * current week is hatched and labelled "Now": it is still running. Every figure is also in a
 * table for screen readers.
 */
export function Activity({ activity }: ActivityProps) {
  const { weeks, totalSent, totalHires } = activity;
  const max = Math.max(1, ...weeks.map((w) => w.sent));
  const empty = totalSent === 0 && totalHires === 0;
  const hires = `${totalHires} ${totalHires === 1 ? "hire" : "hires"}`;

  return (
    <Section title="Hiring activity" hint="Last 8 weeks, Monday to Sunday, India time" action={<Link href="/employer/proposals" className="inline-flex min-h-11 items-center font-medium text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline">Open proposals</Link>}>
      {empty ? (
        <p className="py-6 text-sm text-ink-700">
          Nothing sent yet. Your first proposal shows up here, with the week it went out.{" "}
          <Link href="/employer/candidates" className="font-medium text-brand-700 underline underline-offset-4">Find candidates</Link>
        </p>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <Count value={totalSent} className="nums font-display text-4xl font-semibold leading-none tracking-[-0.03em] text-ink-900" />
            <span className="text-sm text-ink-700">{totalSent === 1 ? "proposal" : "proposals"} sent, {hires}</span>
          </p>

          <div role="img" aria-label={`Proposals sent per week, last 8 weeks: ${weeks.map((w) => `${w.label} ${w.sent}`).join(", ")}. Hires: ${hires}.`} className="mt-5">
            <div aria-hidden className="relative">
              <ol className="grid grid-cols-8 items-end gap-2 border-b border-ink-400">
                {weeks.map((w, i) => (
                  <li key={w.start} className="flex flex-col items-center justify-end" style={{ height: PLOT + 20 }}>
                    {w.sent > 0 ? <span className="nums mb-1 text-xs font-medium text-ink-900">{w.sent}</span> : null}
                    <Reveal
                      axis="y"
                      index={i}
                      className={cn("w-full rounded-t-sm", w.sent > 0 ? (w.current ? cn(HATCH, "border-t-2 border-brand-700") : "bg-brand-600") : "bg-ink-200")}
                      style={{ height: w.sent > 0 ? Math.max(4, Math.round((w.sent / max) * PLOT)) : 2 }}
                    />
                  </li>
                ))}
              </ol>
              <ol className="mt-2 grid grid-cols-8 gap-2">
                {weeks.map((w, i) => (
                  <li key={w.start} className={cn("flex justify-center whitespace-nowrap text-xs", w.current ? "font-semibold text-ink-900" : "text-ink-600")}>
                    {w.current ? "Now" : i % 2 === 1 ? w.label : ""}
                  </li>
                ))}
              </ol>
              <p className="mt-4 border-t border-ink-200 pt-2 text-xs text-ink-700">Hired that week</p>
              <ol className="mt-1.5 grid grid-cols-8 gap-2">
                {weeks.map((w) => (
                  <li key={w.start} className="flex justify-center">
                    {w.hires > 0 ? (
                      <span className="nums grid size-6 place-items-center rounded-full bg-brand-800 text-xs font-semibold text-white">{w.hires}</span>
                    ) : (
                      <span className="size-1 self-center rounded-full bg-ink-300" />
                    )}
                  </li>
                ))}
              </ol>
            </div>
            <p aria-hidden className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 bg-brand-600" />Proposals sent</span>
              <span className="inline-flex items-center gap-1.5"><span className={cn("h-3 w-3", HATCH)} />This week, not finished</span>
            </p>
          </div>
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
    </Section>
  );
}
