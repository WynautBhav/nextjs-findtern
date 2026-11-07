import { Children, cloneElement, isValidElement } from "react";
import { Check } from "lucide-react";

import type { CandidateProfile } from "@/lib/employer-candidates";
import { cn } from "@/lib/utils";

/* ── Matrix pieces ───────────────────────────────────────────────────────── */

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
          "sticky left-0 z-10 border-r border-ink-100 p-4 text-left align-top text-sm font-semibold text-ink-900 max-sm:hidden",
          last ? "" : "border-b",
          accent ? "bg-brand-50" : "bg-surface",
        )}
      >
        {label}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-ink-600">{hint}</span> : null}
      </th>
      {/* Phone: no label column, so each cell carries its row's label. */}
      {Children.map(children, (child) => (isValidElement<{ label?: string }>(child) ? cloneElement(child, { label }) : child))}
    </tr>
  );
}

export function Cell({ leader, label, children }: { leader?: boolean; label?: string; children: React.ReactNode }) {
  return (
    <td className={cn("border-r border-ink-100 p-3 align-top text-sm text-ink-800 max-sm:snap-start sm:p-4 last:border-r-0", leader && "bg-brand-50/60")}>
      {label ? <span className="mb-1 block text-xs font-medium text-ink-600 sm:hidden">{label}</span> : null}
      {children}
    </td>
  );
}

export function LeaderMark() {
  return (
    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-800">
      <Check className="size-3.5" aria-hidden />
      Leads
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
  render: (candidate: CandidateProfile) => React.ReactNode;
}) {
  const lead = leaders(values);
  return (
    <MatrixRow label={label}>
      {candidates.map((c, i) => (
        <Cell key={c.id} leader={lead.has(i)}>
          {render(c)}
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
