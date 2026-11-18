import { EmptyScene } from "@/components/app/primitives";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RankGroup = { title: string; note?: string; rows: { label: string; value: number; display?: string }[]; capitalize?: boolean };

/**
 * One card, one to three ranked lists side by side (stacked on a phone).
 * Bars are sized within their own list; values are right-aligned figures.
 */
export function RankCard({ title, description, groups, empty = "Nothing in this period." }: { title: string; description?: string; groups: RankGroup[]; empty?: string }) {
  return (
    <Panel>
      <PanelHeader title={title} description={description} />
      <PanelBody>
        <div className={cn("grid gap-x-8 gap-y-6", groups.length === 2 && "md:grid-cols-2", groups.length >= 3 && "md:grid-cols-2 xl:grid-cols-3")}>
          {groups.map((g) => {
            const max = Math.max(1, ...g.rows.map((r) => r.value));
            return (
              <div key={g.title} className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{g.title}</h3>
                {g.note ? <p className="text-xs text-text-subtle">{g.note}</p> : null}
                {g.rows.length === 0 ? (
                  <EmptyScene compact title={`Nothing in ${g.title.toLowerCase()}`} body={empty} />
                ) : (
                  <ul className="mt-3 space-y-3">
                    {g.rows.map((r) => (
                      <li key={r.label}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className={cn("min-w-0 [overflow-wrap:anywhere] text-foreground", g.capitalize && "capitalize")}>{r.label}</span>
                          <span className="nums shrink-0 text-right font-semibold text-foreground">{r.display ?? formatNumber(r.value)}</span>
                        </div>
                        <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--admin-panel-2)]">
                          <div className="h-full rounded-full bg-[color:var(--admin-tile)]" style={{ width: `${(r.value / max) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </PanelBody>
    </Panel>
  );
}
