import Link from "next/link";

import { ChevronDown } from "lucide-react";
import { toQueryString } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

/**
 * The stage switch of the proposal queue. One URL param (`lane`) picks the view; the page is a
 * triage queue, not a board, so a stage is a way to narrow the list, with the share of the
 * pipeline it holds drawn as a thin proportional rule under its name. Server-rendered links, no
 * client state. From lg up it is a ruled list in the left column; below that it is the same
 * choices as wrapping filter tabs (a 390px screen has no room for a rail).
 */

export type PipelineStage = { key: string; label: string; statuses: readonly string[] };

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { key: "sent", label: "Sent", statuses: ["sent", "draft"] },
  { key: "interview", label: "Interview", statuses: ["interview_scheduled"] },
  { key: "accepted", label: "Accepted", statuses: ["accepted"] },
  { key: "processing", label: "Processing", statuses: ["processing"] },
  { key: "hired", label: "Hired", statuses: ["hired"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "expired", "withdrawn"] },
];

/** The stages where an offer is still moving (everything before hired or closed). */
export const OPEN_STAGE_KEYS = ["sent", "interview", "accepted", "processing"] as const;
export const OPEN_STATUSES: readonly string[] = PIPELINE_STAGES.filter((s) => (OPEN_STAGE_KEYS as readonly string[]).includes(s.key)).flatMap((s) => s.statuses);

export type LaneKey = "open" | "all" | (typeof PIPELINE_STAGES)[number]["key"];

export function parseLane(value: string | undefined): LaneKey {
  if (value === "all" || value === "open") return value;
  return PIPELINE_STAGES.find((s) => s.key === value)?.key ?? "open";
}

/** Whether a proposal status belongs to the chosen view. */
export function inLane(lane: LaneKey, status: string): boolean {
  if (lane === "all") return true;
  if (lane === "open") return OPEN_STATUSES.includes(status);
  return PIPELINE_STAGES.find((s) => s.key === lane)?.statuses.includes(status) ?? false;
}

type Entry = { key: LaneKey; label: string; count: number; bar: boolean };

export function ProposalStageNav({
  statuses,
  lane,
  params,
  basePath,
}: {
  /** One status per proposal in the period (after the company / candidate / date filters). */
  statuses: string[];
  lane: LaneKey;
  params: Record<string, string>;
  basePath: string;
}) {
  const total = statuses.length;
  const count = (k: LaneKey) => statuses.filter((s) => inLane(k, s)).length;
  const href = (k: LaneKey) => `${basePath}${toQueryString({ ...params, tab: "proposals", lane: k === "open" ? "" : k, page: "" })}`;

  // A stage with nothing in it is left out, unless it is the one being looked at.
  const stages: Entry[] = PIPELINE_STAGES.map((s) => ({ key: s.key as LaneKey, label: s.label, count: count(s.key as LaneKey), bar: true })).filter((e) => e.count > 0 || e.key === lane);
  const head: Entry = { key: "open", label: "Open", count: count("open"), bar: false };
  const tail: Entry = { key: "all", label: "All", count: total, bar: false };

  const list = (
    <>
      <ul className="border-y border-ink-200">
        <Row entry={head} on={lane === head.key} href={href(head.key)} total={total} hint="Sent, interview, accepted, processing" />
      </ul>
      <ul className="mt-4 divide-y divide-ink-200 border-y border-ink-200">
        {stages.map((e) => (
          <Row key={e.key} entry={e} on={lane === e.key} href={href(e.key)} total={total} />
        ))}
      </ul>
      <ul className="mt-4 border-y border-ink-200">
        <Row entry={tail} on={lane === tail.key} href={href(tail.key)} total={total} />
      </ul>
    </>
  );
  const current = [head, ...stages, tail].find((e) => e.key === lane) ?? head;

  return (
    <>
      <nav aria-label="Proposal stage" className="hidden lg:block">
        {list}
      </nav>
      {/* Below lg: one line that says where you are, opening onto the same list. */}
      <details className="group rounded-lg border border-ink-200 bg-surface-raised lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-medium text-ink-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden">
          <span>
            Stage: {current.label} <span className="nums text-ink-600">{current.count}</span>
          </span>
          <ChevronDown className="size-4 text-ink-600 transition-transform duration-[var(--motion-fast)] group-open:rotate-180" aria-hidden />
        </summary>
        <nav aria-label="Proposal stage" className="border-t border-ink-200 p-3">
          {list}
        </nav>
      </details>
    </>
  );
}

function Row({ entry, on, href, total, hint }: { entry: Entry; on: boolean; href: string; total: number; hint?: string }) {
  const share = total ? Math.max(entry.count ? 3 : 0, Math.round((entry.count / total) * 100)) : 0;
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={on ? "page" : undefined}
        className={cn(
          "group block min-h-10 px-2 py-2 transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700",
          on ? "bg-ink-900 text-paper" : "hover:bg-ink-200/50",
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn("text-sm", on ? "font-semibold" : "font-medium text-ink-900")}>{entry.label}</span>
          <span className={cn("nums font-display text-base font-semibold", on ? "text-paper" : entry.count ? "text-ink-900" : "text-ink-500")}>
            {entry.count}
            {entry.count === 0 ? <span className="sr-only"> (none right now)</span> : null}
          </span>
        </span>
        {hint ? <span className={cn("mt-0.5 block text-xs", on ? "text-paper/75" : "text-ink-600")}>{hint}</span> : null}
        {entry.bar ? (
          <span aria-hidden className={cn("mt-1.5 block h-0.5 rounded-full", on ? "bg-paper/25" : "bg-ink-200")}>
            <span className={cn("block h-full rounded-full", on ? "bg-paper" : "bg-brand-800")} style={{ width: `${share}%` }} />
          </span>
        ) : null}
      </Link>
    </li>
  );
}
