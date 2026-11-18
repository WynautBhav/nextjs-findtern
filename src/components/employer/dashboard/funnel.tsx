import Link from "next/link";

import { Arrive } from "@/components/admin/motion/arrive";
import { Count } from "@/components/admin/motion/count";
import { Reveal } from "@/components/admin/motion/reveal";
import { Section } from "@/components/app/stat";
import type { Funnel as FunnelData, FunnelStage } from "@/lib/employer-dashboard";
import { cn } from "@/lib/utils";

import { HATCH } from "./chart-card";

/** `funnel.stages` has 4 entries in order: pipeline, offered, accepted, hired. See `FunnelStage` for each field. */
export type FunnelProps = { funnel: FunnelData };

/** Brand ramp, light to deep: the block darkens as the candidate gets closer to a hire. Hired is the deepest. */
const FILL = ["bg-brand-300", "bg-brand-400", "bg-brand-600", "bg-brand-800"] as const;
const PLOT = 136; // height of the tallest block (the whole pipeline), px

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-700";

function conversion(s: FunnelStage) {
  if (s.conversionOf === null) return null;
  return s.conversionPct === null ? "none to convert" : `${s.conversionPct}% ${s.conversionOf}`;
}

/**
 * The hiring funnel as one silhouette: four blocks side by side, each as tall as the number of
 * candidates at that stage, so the step-down is the funnel. One scale for all four (the tallest is
 * the whole pipeline, said in a line under the shape); hatching on Offered marks candidates whose
 * every offer was declined or expired. The conversion into each stage is written under it. What is
 * waiting at a stage is a ruled list below, each row opening its Proposals tab.
 */
export function Funnel({ funnel }: FunnelProps) {
  const { stages, hasData } = funnel;
  const total = Math.max(1, stages[0]?.count ?? 1);
  const waiting = stages.filter((s) => s.sub || s.lost > 0);

  return (
    <Section title="Hiring funnel" hint="Every candidate counted once, all time">
      <ol className="grid grid-cols-4 gap-2 border-b border-ink-400">
        {stages.map((s, i) => {
          const h = s.count > 0 ? Math.max(6, Math.round((s.count / total) * PLOT)) : 2;
          const lostH = s.count > 0 ? Math.round((s.lost / s.count) * h) : 0;
          return (
            <Arrive as="li" key={s.key} index={i} className="flex min-w-0 flex-col justify-end">
              <Link href={s.href} className={cn("group flex h-full flex-col justify-end pt-2 transition-colors hover:bg-ink-100/60", FOCUS)}>
                <span className="px-1">
                  <Count value={s.count} className="nums block font-display text-4xl font-semibold leading-none tracking-[-0.03em] text-ink-900" />
                  <span className="mt-1 block text-sm font-medium text-ink-900">{s.label}</span>
                  <span className="nums mt-0.5 block min-h-8 text-xs leading-4 text-ink-700">{s.key === "pipeline" ? "Shortlisted, met or offered" : conversion(s)}</span>
                </span>
                <span aria-hidden className="mt-2 block w-full" style={{ height: PLOT }}>
                  <span className="flex h-full items-end">
                    <Reveal axis="y" index={i} className={cn("relative block w-full", s.count > 0 ? FILL[i] : "border-t border-dashed border-ink-300")} style={{ height: h }}>
                      {lostH > 0 ? <span className={cn("absolute inset-x-0 top-0 block", HATCH)} style={{ height: lostH }} /> : null}
                    </Reveal>
                  </span>
                </span>
              </Link>
            </Arrive>
          );
        })}
      </ol>
      {waiting.length ? (
        <ul className="mt-5 border-t border-ink-200">
          {waiting.map((s) => (
            <li key={s.key} className="border-b border-ink-200">
              <Link href={s.href} className={cn("flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm hover:bg-ink-100/60", FOCUS)}>
                <span className="font-medium text-ink-900">{s.label}</span>
                <span className="text-ink-700">{[s.sub, s.lost > 0 ? `${s.lost} declined or expired (hatched)` : null].filter(Boolean).join(" · ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-sm text-ink-600">
        {hasData ? (
          <>One scale: the tallest block is the {stages[0].count} in your pipeline.</>
        ) : (
          <>
            Nobody in your pipeline yet.{" "}
            <Link href="/employer/candidates" className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
              Find candidates
            </Link>
          </>
        )}
      </p>
    </Section>
  );
}
