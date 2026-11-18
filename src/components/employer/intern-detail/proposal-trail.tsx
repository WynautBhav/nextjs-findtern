import { Pill, type Tone } from "@/components/app/primitives";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A proposal's life as a four-step trail: Sent, Accepted, Paid, Hired. The steps already reached are
 * filled and the current one is named in bold, with the date it was reached when the page has one.
 * A closed offer (declined, withdrawn, expired) has no trail, only its pill.
 */
const STAGES = ["Sent", "Accepted", "Paid", "Hired"] as const;

/** Where a stored status sits on the trail; null = closed, no trail. */
export function stageIndex(status: string): number | null {
  switch (status.toLowerCase()) {
    case "sent":
    case "interview_scheduled":
      return 0;
    case "accepted":
      return 1;
    case "processing":
      return 2;
    case "hired":
      return 3;
    default:
      return null;
  }
}

export type TrailRow = {
  id: string;
  projectName: string | null;
  status: string;
  pill: { label: string; tone: Tone };
  sentAt: Date | null;
  movedAt: Date | null;
};

export function ProposalTrail({ rows }: { rows: TrailRow[] }) {
  return (
    <ul className="divide-y divide-ink-200 border-y border-ink-200">
      {rows.map((row) => {
        const at = stageIndex(row.status);
        return (
          <li key={row.id} className="py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 break-words text-sm font-medium text-ink-900">{row.projectName ?? "Project no longer listed"}</span>
              <Pill tone={row.pill.tone} className="shrink-0">
                {row.pill.label}
              </Pill>
            </div>
            {at !== null ? (
              <ol className="mt-2.5 grid grid-cols-4 gap-1" aria-label="Proposal progress">
                {STAGES.map((label, i) => {
                  const reached = i <= at;
                  const date = i === 0 ? row.sentAt : i === at ? row.movedAt : null;
                  return (
                    <li key={label} aria-current={i === at ? "step" : undefined} className="min-w-0">
                      <span aria-hidden className={cn("block h-1 rounded-sm", reached ? "bg-brand-700" : "bg-ink-200")} />
                      <span className={cn("mt-1 block text-xs", i === at ? "font-semibold text-ink-900" : reached ? "text-ink-700" : "text-ink-600")}>
                        {label}
                        <span className="sr-only">{reached ? (i === at ? " (now)" : " (done)") : " (not yet)"}</span>
                      </span>
                      {date ? <span className="nums block text-xs text-ink-600">{formatDate(date)}</span> : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
