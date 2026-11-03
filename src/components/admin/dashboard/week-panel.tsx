import { PillBars } from "@/components/admin/charts/pill-bars";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import type { WeekBar } from "@/lib/admin/dashboard-overview-pure";

/**
 * Proposals created per day of the current India week, Monday to Sunday. Today is the filled bar, days
 * that have not happened are hatched. `data` is null when the read failed: the panel says so instead of
 * drawing a flat week.
 */
export function WeekPanel({ data, href }: { data: { bars: WeekBar[]; total: number } | null; href: string | null }) {
  return (
    <Panel className="h-full" aria-labelledby="week-title">
      <PanelHeader
        title={<span id="week-title">Proposals this week</span>}
        description={data ? `${data.total} sent since Monday, India time` : undefined}
        linkHref={href ?? undefined}
        linkLabel="Open the proposal pipeline"
      />
      <PanelBody>
        {data ? (
          <PillBars data={data.bars} unit="proposals" ariaLabel="Proposals created per day this week" height={300} />
        ) : (
          <p role="alert" className="text-sm text-foreground">
            Couldn&apos;t load this week&apos;s proposals. Nothing was changed; reload to try again.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
