import { AdminAvatar } from "@/components/admin/avatar";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BandCard, PipelineBand } from "@/lib/admin/dashboard-overview-pure";

/**
 * The hire pipeline as one band: Sent, Interview, Accepted, Processing, Hired, each with its count and
 * the offer value in it (per currency, never summed across currencies). The stage that has waited
 * longest (3 days or more, never Hired) is marked, and below it the people who have waited longest.
 * `band` is null when the read failed: the card says so rather than drawing an empty pipeline.
 */
export function PipelineBandCard({ band, href }: { band: PipelineBand | null; href: string | null }) {
  return (
    <Panel className="h-full" aria-labelledby="pipeline-title">
      <PanelHeader
        title={<span id="pipeline-title">Hire pipeline</span>}
        description={band ? (band.total > 0 ? `${band.total.toLocaleString("en-IN")} proposals from sent to hired` : "Nothing in the pipeline yet") : undefined}
        linkHref={href ?? undefined}
        linkLabel="Open the proposal pipeline"
      />
      <PanelBody className="space-y-4">
        {band ? <Band band={band} /> : <p role="alert" className="text-sm text-foreground">Couldn&apos;t load the pipeline. Nothing was changed; reload to try again.</p>}
      </PanelBody>
    </Panel>
  );
}

function money(totals: { currency: string; minor: number }[]): string {
  if (totals.length === 0) return "";
  return totals.map((t) => formatMoney(t.minor, t.currency, { short: true, zeroLabel: false })).join(" + ");
}

function Band({ band }: { band: PipelineBand }) {
  const stuck = band.stages.find((s) => s.key === band.stuck) ?? null;
  // The people to chase: the stuck stage's longest-waiting cards, else the longest-waiting open card anywhere.
  // One row per person: the same intern can hold two proposals in a stage.
  const once = <T extends { card: BandCard }>(list: T[]) => list.filter((x, i) => list.findIndex((y) => y.card.internId === x.card.internId) === i);
  const chase: { card: BandCard; stage: string }[] = stuck
    ? once(stuck.cards.map((card) => ({ card, stage: stuck.label })))
    : once(
        band.stages
          .filter((s) => s.key !== "hired")
          .flatMap((s) => s.cards.map((card) => ({ card, stage: s.label })))
          .filter((x) => x.card.waitingDays != null)
          .sort((a, b) => (b.card.waitingDays ?? 0) - (a.card.waitingDays ?? 0)),
      ).slice(0, 3);
  const weights = band.stages.map((s) => Math.max(s.count, 0));
  const sum = weights.reduce((n, w) => n + w, 0);

  return (
    <>
      {sum > 0 ? (
        <div aria-hidden className="flex h-2 gap-1 overflow-hidden rounded-full max-sm:hidden">
          {band.stages.map((s, i) => (
            <span
              key={s.key}
              style={{ flexGrow: Math.max(weights[i], sum * 0.02) }}
              className={cn("min-w-1 rounded-full", s.key === "hired" ? "bg-[color:var(--admin-tile)]" : s.key === band.stuck ? "bg-brand-500" : "bg-[color:var(--admin-bar-tint)]")}
            />
          ))}
        </div>
      ) : null}
      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-5 sm:gap-2">
        {band.stages.map((s) => {
          const isStuck = s.key === band.stuck;
          const value = money(s.totals);
          return (
            <li
              key={s.key}
              className={cn(
                "flex min-w-0 items-center justify-between gap-2 rounded-2xl bg-[color:var(--admin-panel-2)] px-3 py-2 sm:block sm:py-3",
                isStuck && "ring-2 ring-accent-500/70",
                s.key === "hired" && "bg-[color:var(--admin-bar-tint)]",
              )}
            >
              <p className={cn("text-xs font-semibold uppercase tracking-wider", s.key === "hired" ? "text-brand-900" : "text-text-subtle")}>{s.label}</p>
              <div className="flex items-baseline gap-2 sm:mt-1 sm:block">
                <p className="nums text-xl font-semibold leading-none tracking-[-0.02em] text-foreground sm:text-[1.75rem]">{s.count.toLocaleString("en-IN")}</p>
                <p className={cn("nums truncate text-xs leading-4 sm:mt-1.5", s.key === "hired" ? "text-brand-900" : "text-text-subtle")} title={value || undefined}>
                  {s.count === 0 ? "—" : value || (s.key === "hired" ? "all time" : "no offer value")}
                </p>
              </div>
              {isStuck && s.oldestDays != null ? (
                <p className="nums hidden w-fit rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning sm:mt-2 sm:block">waiting {s.oldestDays} d</p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {chase.length > 0 ? (
        <div className="max-sm:hidden">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-subtle">{stuck ? `Waiting longest in ${stuck.label}` : "Waiting longest"}</p>
          <ul className="grid gap-x-4 sm:grid-cols-3">
            {chase.map(({ card, stage }) => (
              <li key={card.id} className="flex min-w-0 items-center gap-2.5 py-1">
                <AdminAvatar name={card.name} id={card.internId} size="sm" />
                <span className="min-w-0 text-sm leading-5">
                  <span className="block truncate font-medium text-foreground" title={card.name}>{card.name}</span>
                  <span className="block truncate text-xs text-text-subtle" title={`${card.company}, ${stage}`}>
                    {card.company}{card.waitingDays != null ? ` · ${card.waitingDays} d` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
