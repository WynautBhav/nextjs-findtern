import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { STIPEND_CURRENCY, type StipendPlan } from "./months";

/** Semicircle, centre (100,100), radius 80; pathLength 100 makes every dash a percentage. */
const ARC = "M20 100 A80 80 0 0 1 180 100";

/**
 * Paid against the whole internship's stipend: paid solid, scheduled a
 * lighter green, still to come hatched (the Home chart's "not yet" mark).
 * One draw-in on load, skipped under reduced motion; the figures are text.
 */
export function StipendGauge({ plan, id }: { plan: StipendPlan; id: string }) {
  const { totalMinor, paidMinor, pendingMinor, toComeMinor } = plan;
  const pct = (n: number) => (totalMinor > 0 ? Math.min(100, (n / totalMinor) * 100) : 0);
  const paid = pct(paidMinor);
  const pending = Math.min(100 - paid, pct(pendingMinor));
  const money = (n: number) => formatMoney(n, STIPEND_CURRENCY, { zeroLabel: false });
  const hatch = `stipend-hatch-${id}`;

  const legend = [
    { key: "paid", label: "Paid", minor: paidMinor, mark: "bg-brand-700" },
    { key: "pending", label: "Scheduled", minor: pendingMinor, mark: "bg-brand-300" },
    {
      key: "tocome",
      label: "Still to come",
      minor: toComeMinor,
      // taste-skill-ignore: the hatch is a pattern mark for "not yet", matching the gauge track.
      mark: "bg-[repeating-linear-gradient(135deg,var(--color-brand-300)_0_2px,transparent_2px_5px)] ring-1 ring-inset ring-brand-300",
    },
  ].filter((l) => l.key !== "pending" || l.minor > 0);

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative mx-auto w-full max-w-80">
        <svg viewBox="0 0 200 112" className="block w-full" aria-hidden>
          <style>{`
            @media (prefers-reduced-motion: no-preference) {
              .stipend-arc { animation: stipend-draw 1100ms cubic-bezier(0.2, 0.7, 0.3, 1) 120ms both; }
            }
            @keyframes stipend-draw { from { stroke-dashoffset: var(--from); } }
          `}</style>
          <defs>
            <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="fill-brand-50" />
              <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2.5" className="stroke-brand-300" />
            </pattern>
          </defs>
          <path d={ARC} fill="none" strokeWidth="24" strokeLinecap="round" stroke={`url(#${hatch})`} />
          {pending > 0 ? (
            <path
              d={ARC}
              pathLength={100}
              fill="none"
              strokeWidth="24"
              strokeLinecap="round"
              className="stipend-arc stroke-brand-300"
              strokeDasharray={`${pending} 200`}
              strokeDashoffset={-paid}
              // Starts hidden under the paid arc and slides out once that has drawn.
              style={{ "--from": `${pending - paid}`, animationDelay: "700ms" } as React.CSSProperties}
            />
          ) : null}
          {paid > 0 ? (
            <path
              d={ARC}
              pathLength={100}
              fill="none"
              strokeWidth="24"
              strokeLinecap="round"
              className="stipend-arc stroke-brand-700"
              strokeDasharray={`${paid} 200`}
              strokeDashoffset={0}
              style={{ "--from": `${paid}` } as React.CSSProperties}
            />
          ) : null}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center">
          <p className="nums text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">{money(paidMinor)}</p>
          <p className="nums text-xs text-text-subtle">paid of {money(totalMinor)}</p>
        </div>
      </div>

      <dl className="mt-6 grid gap-2 border-t border-ink-100 pt-4">
        {legend.map((l) => (
          <div key={l.key} className="flex items-center gap-3 text-sm">
            <span aria-hidden className={cn("size-3 shrink-0 rounded-full", l.mark)} />
            <dt className="flex-1 text-ink-700">{l.label}</dt>
            <dd className="nums font-medium text-ink-900">{money(l.minor)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
