import Link from "next/link";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { PipelineBand } from "@/lib/admin/dashboard-overview-pure";

import { AgeDays } from "./ledger";

/**
 * The hire pipeline as one proportional bar plus a ruled ledger underneath: a stage's segment is exactly
 * its share of the proposals (a stage with none has no segment at all, never a sliver, and its row says
 * "none"). Each row carries the offer value in it and how long its oldest proposal has waited.
 * Accepted and hired together are the placements figure on the hero list; the foot line says so.
 */
export function PipelineLedger({ band, href }: { band: PipelineBand | null; href: string | null }) {
  if (!band) {
    return <p role="alert" className="text-sm text-ink-900">Couldn&apos;t load the pipeline. Nothing was changed; reload to try again.</p>;
  }
  const sum = band.stages.reduce((n, s) => n + Math.max(s.count, 0), 0);
  const money = (t: { currency: string; minor: number }[]) => t.map((x) => formatMoney(x.minor, x.currency, { short: true, zeroLabel: false })).join(" + ");
  const shades = ["bg-ink-400", "bg-ink-500", "bg-brand-500", "bg-brand-600", "bg-brand-800"];
  const placed = band.stages.filter((s) => s.key === "accepted" || s.key === "hired").reduce((n, s) => n + s.count, 0);
  return (
    <section aria-labelledby="pipeline-title">
      <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink-800 pb-2">
        <h2 id="pipeline-title" className="text-lg font-semibold text-ink-900">Hire pipeline</h2>
        {href ? <Link href={href} className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">Open the pipeline</Link> : null}
      </div>
      {sum === 0 ? (
        <p className="py-4 text-sm text-ink-700">Nothing in the pipeline yet. It fills as employers send proposals.</p>
      ) : (
        <>
          <div role="img" aria-label={band.stages.filter((s) => s.count > 0).map((s) => `${s.label} ${s.count}`).join(", ")} className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-md">
            {band.stages.map((s, i) => (s.count > 0 ? <span key={s.key} className={cn("block", shades[i % shades.length])} style={{ flexGrow: s.count, flexBasis: 0 }} /> : null))}
          </div>
          <table className="mt-2 w-full border-collapse text-sm">
            <caption className="sr-only">Proposals by stage</caption>
            <thead>
              <tr className="text-ink-700">
                <th scope="col" className="py-2 text-left font-medium">Stage</th>
                <th scope="col" className="py-2 text-right font-medium">Proposals</th>
                <th scope="col" className="py-2 text-right font-medium">Offer value</th>
                <th scope="col" className="py-2 text-right font-medium">Oldest</th>
              </tr>
            </thead>
            <tbody>
              {band.stages.map((s, i) => (
                <tr key={s.key} className="border-t border-ink-200">
                  <th scope="row" className="py-2.5 text-left font-medium text-ink-900">
                    <span aria-hidden className={cn("mr-2 inline-block size-2 rounded-sm align-middle", s.count > 0 ? shades[i % shades.length] : "border border-ink-300")} />
                    {s.label}
                    {s.key === band.stuck ? <span className="ml-2 text-xs font-semibold text-signal">stuck</span> : null}
                  </th>
                  <td className={cn("nums py-2.5 text-right", s.count > 0 ? "text-lg font-semibold text-ink-900" : "text-ink-600")}>{s.count > 0 ? s.count : "none"}</td>
                  <td className="nums py-2.5 text-right text-ink-700">{s.count > 0 ? money(s.totals) || "–" : ""}</td>
                  <td className="py-2.5 text-right">{s.oldestDays != null ? <AgeDays days={s.oldestDays} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-ink-200 pt-3 text-xs text-ink-600">
            {sum.toLocaleString("en-IN")} proposals sent. Drafts, rejected and withdrawn are not on this list. Accepted and hired ({placed}) together are the placements figure above.
          </p>
        </>
      )}
    </section>
  );
}
