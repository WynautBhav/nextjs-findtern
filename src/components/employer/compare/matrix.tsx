import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CandidateProfile } from "@/lib/employer-candidates";

/** Index of the single highest value, if one candidate leads outright. */
export function leaders(values: number[]): Set<number> {
  const max = Math.max(...values, 0);
  const at = values.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
  return max > 0 && at.length === 1 && values.length > 1 ? new Set(at) : new Set();
}

export function MatrixRow({
  label,
  hint,
  accent,
  last,
  children,
}: {
  label: string;
  hint?: string;
  accent?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr className={cn("[&>td]:border-b [&>td]:border-ink-100", last && "[&>td]:border-b-0")}>
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-10 border-r border-ink-100 p-3 text-left align-top text-sm font-semibold text-ink-900 sm:p-4",
          last ? "" : "border-b",
          accent ? "bg-brand-50" : "bg-white",
        )}
      >
        {label}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-ink-600">{hint}</span> : null}
      </th>
      {children}
    </tr>
  );
}

export function Cell({ leader, children }: { leader?: boolean; children: React.ReactNode }) {
  return (
    <td
      className={cn(
        "border-r border-ink-100 p-4 align-top text-sm last:border-r-0",
        leader ? "bg-brand-50/70 font-semibold text-ink-900" : "text-ink-700",
      )}
    >
      {children}
    </td>
  );
}

/** Visible "Leads" tag on the winning cell of a row, with the same words for screen readers. */
export function LeaderMark() {
  return (
    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold text-white">
      <Check className="size-3" aria-hidden />
      Leads
      <span className="sr-only"> this row</span>
    </span>
  );
}

/** A 0-10 rating as a bar; the row leader's bar is brand green, the rest ink. */
export function RatingBar({ value, leader, className }: { value: number; leader?: boolean; className?: string }) {
  return (
    <span className={cn("block h-2 overflow-hidden rounded-full bg-ink-100", className)} aria-hidden>
      <span
        className={cn("block h-full rounded-full", leader ? "bg-brand-600" : "bg-ink-400")}
        style={{ width: `${Math.min(100, Math.max(0, value * 10))}%` }}
      />
    </span>
  );
}

export function NumericRow({
  label,
  values,
  candidates,
  render,
}: {
  label: string;
  values: number[];
  candidates: CandidateProfile[];
  render: (candidate: CandidateProfile, leader: boolean) => React.ReactNode;
}) {
  const lead = leaders(values);
  return (
    <MatrixRow label={label}>
      {candidates.map((c, i) => (
        <Cell key={c.id} leader={lead.has(i)}>
          {render(c, lead.has(i))}
          {lead.has(i) ? (
            <span className="block">
              <LeaderMark />
            </span>
          ) : null}
        </Cell>
      ))}
    </MatrixRow>
  );
}
