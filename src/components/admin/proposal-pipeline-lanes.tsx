import Link from "next/link";

import { AdminAvatar } from "@/components/admin/avatar";
import { ProposalDetailsButton } from "@/components/admin/proposal-tracker-dialogs";
import { StatusBadge } from "@/components/admin/status-badge";
import { ADMIN_SURFACE } from "@/components/admin/surface";
import { toQueryString } from "@/lib/admin/params";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The proposal pipeline as lanes: one rounded inset lane per stage, one white
 * person card per proposal. Server-rendered from cards the tracker view has
 * already filtered and sorted. Each lane shows its first few cards and links
 * ("Show all") to the same page with that lane opened in full, so there is no
 * client state and the link works without script.
 *
 * Keyboard: every lane is a focus stop (an empty lane included), so Tab walks
 * the lanes in order and the browser scrolls the focused one into view inside
 * the horizontal scroller; the cards' own links and buttons stay real tab
 * stops inside it.
 */

export type PipelineCard = {
  id: string;
  status: string;
  internId: string;
  name: string;
  email: string | null;
  employerId: string;
  company: string;
  project: string;
  /** "Interview first" | "Direct offer". */
  flow: string;
  fullTimeHired: boolean;
  /** "₹30,000/mo" or "₹6,00,000 CTC"; "-" when the offer has no figure. */
  amount: string;
  /** "6 mo internship" | "Full-time". */
  amountSub: string;
  /** Whole offer value in minor units of `currency`, for the lane total. */
  valueMinor: number | null;
  currency: string;
  startLabel: string;
  sentLabel: string;
  details: {
    id: string;
    status: string;
    currency: string | null;
    offerDetails: unknown;
    candidate: string;
    companyName: string;
    projectName: string;
    flow: string;
    sentAt: string;
  };
};

export type PipelineStage = { key: string; label: string; statuses: readonly string[] };

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { key: "sent", label: "Sent", statuses: ["sent", "draft"] },
  { key: "interview", label: "Interview", statuses: ["interview_scheduled"] },
  { key: "accepted", label: "Accepted", statuses: ["accepted"] },
  { key: "processing", label: "Processing", statuses: ["processing"] },
  { key: "hired", label: "Hired", statuses: ["hired"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "expired", "withdrawn"] },
];

/** Cards a lane shows before "Show all". */
export const LANE_CAP = 8;

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function laneTotal(cards: PipelineCard[]): string | null {
  const byCurrency = new Map<string, number>();
  for (const c of cards) {
    if (c.valueMinor != null) byCurrency.set(c.currency, (byCurrency.get(c.currency) ?? 0) + c.valueMinor);
  }
  if (byCurrency.size === 0) return null;
  return [...byCurrency].map(([cur, minor]) => formatMoney(minor, cur, { short: true, zeroLabel: false })).join(" + ");
}

export function ProposalPipelineLanes({
  cards,
  params,
  basePath,
}: {
  cards: PipelineCard[];
  params: Record<string, string>;
  basePath: string;
}) {
  const known = new Set(PIPELINE_STAGES.flatMap((s) => s.statuses));
  const stray = cards.filter((c) => !known.has(c.status));
  const stages: PipelineStage[] = stray.length ? [...PIPELINE_STAGES, { key: "other", label: "Other", statuses: [] }] : [...PIPELINE_STAGES];
  const open = params.lane ?? "";

  return (
    <div
      className="flex gap-[var(--admin-gap)] overflow-x-auto overscroll-x-contain px-[var(--admin-pad-panel)] pb-[var(--admin-pad-panel)]"
      data-pipeline-lanes=""
    >
      {stages.map((stage) => {
        const inLane = stage.key === "other" ? stray : cards.filter((c) => stage.statuses.includes(c.status));
        const expanded = open === stage.key;
        const shown = expanded ? inLane : inLane.slice(0, LANE_CAP);
        const total = laneTotal(inLane);
        const headingId = `lane-${stage.key}`;
        const link = (lane: string) => `${basePath}${toQueryString({ ...params, tab: "proposals", lane })}`;
        return (
          <section
            key={stage.key}
            aria-labelledby={headingId}
            tabIndex={0}
            className={cn(
              "flex w-[17.5rem] shrink-0 flex-col rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel-2)] p-2.5 sm:w-72",
              FOCUS,
            )}
          >
            <header className="flex items-start justify-between gap-2 px-1.5 pt-1 pb-2.5">
              <div className="min-w-0">
                <h3 id={headingId} className="text-sm font-semibold text-foreground">
                  {stage.label}
                </h3>
                <p className="nums mt-0.5 text-xs text-text-subtle">{total ? `${total} offered` : "No offer value"}</p>
              </div>
              <span
                aria-label={`${inLane.length} ${inLane.length === 1 ? "proposal" : "proposals"}`}
                className="nums inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--admin-panel)] px-2 text-xs font-medium text-foreground"
              >
                {inLane.length}
              </span>
            </header>

            {inLane.length === 0 ? (
              <p className="rounded-2xl px-3 py-6 text-center text-sm text-text-subtle">Nothing in this stage.</p>
            ) : (
              <ul className="space-y-2">
                {shown.map((c) => (
                  <li key={c.id} className={cn("rounded-2xl p-3", ADMIN_SURFACE)}>
                    <div className="flex items-start gap-2.5">
                      <AdminAvatar name={c.name} id={c.internId} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/interns/${c.internId}`}
                          className={cn("block truncate rounded-sm text-sm font-medium text-foreground hover:underline", FOCUS)}
                        >
                          {c.name}
                        </Link>
                        <Link
                          href={`/admin/companies/${c.employerId}`}
                          className={cn("block truncate rounded-sm text-[0.8125rem] text-text-subtle hover:text-foreground hover:underline", FOCUS)}
                        >
                          {c.company}
                        </Link>
                        <p className="truncate text-xs text-text-subtle">{c.project}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="nums truncate text-base font-semibold text-foreground">{c.amount}</p>
                        <p className="truncate text-xs text-text-subtle">{c.amountSub}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-text-subtle">
                        <p className="nums">{c.sentLabel}</p>
                        <p className="nums">Starts {c.startLabel}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        {c.fullTimeHired ? <StatusBadge tone="success" label="Full-time hired" /> : <StatusBadge value={c.status} />}
                        <span className="text-xs text-text-subtle">{c.flow}</span>
                      </div>
                      <ProposalDetailsButton proposal={c.details} />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {inLane.length > LANE_CAP ? (
              <Link
                href={link(expanded ? "" : stage.key)}
                scroll={false}
                className={cn(
                  "mt-2 inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-panel)]",
                  FOCUS,
                )}
              >
                {expanded ? "Show fewer" : `Show all ${inLane.length}`}
                <span className="sr-only"> in {stage.label}</span>
              </Link>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
