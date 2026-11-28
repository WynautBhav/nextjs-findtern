"use client";

import { useId, useState } from "react";
import { ChevronDown, Flame } from "lucide-react";

import { cn } from "@/lib/utils";
import { HOT_AT, WARM_AT, type HeatGuide as Guide } from "@/lib/admin/heat";

/**
 * "What heat means": a disclosure that spells out a page's heat rules, so the number is never a mystery. Closed by
 * default; the button sits next to the table's heat column or sort. Content comes from the page's own HeatGuide.
 */
export function HeatGuide({ guide, className }: { guide: Guide; className?: string }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className={cn("text-sm", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-medium text-brand-700 outline-none hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Flame className="size-4" aria-hidden />
        What heat means
        <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      <div id={panel} hidden={!open} className="mt-2 max-w-3xl rounded-xl border border-ink-200 bg-background p-4 text-ink-800">
        <p className="text-foreground">{guide.measures}</p>
        <p className="mt-2 text-text-subtle">
          Each row gets a score from 0 to 100 by adding the points below. <strong className="font-medium text-foreground">Hot</strong> is {HOT_AT} or more,{" "}
          <strong className="font-medium text-foreground">Warm</strong> is {WARM_AT} to {HOT_AT - 1}, <strong className="font-medium text-foreground">Calm</strong> is below {WARM_AT}. Hover or tab to a heat mark to see the exact reason for that row.
        </p>
        <table className="mt-3 w-full border-collapse text-left">
          <caption className="sr-only">How the heat score is added up</caption>
          <thead>
            <tr className="border-b border-ink-200 text-text-subtle">
              <th scope="col" className="py-1.5 pr-4 font-medium">What adds heat</th>
              <th scope="col" className="py-1.5 font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {guide.factors.map((f) => (
              <tr key={f.label} className="border-b border-ink-100 align-top last:border-0">
                <td className="py-1.5 pr-4">{f.label}</td>
                <td className="nums py-1.5 whitespace-nowrap">{f.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-text-subtle">No heat: {guide.noHeat}</p>
        {guide.action ? <p className="mt-1 text-text-subtle">{guide.action}</p> : null}
      </div>
    </div>
  );
}
