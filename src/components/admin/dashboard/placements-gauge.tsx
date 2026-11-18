import { Gauge } from "@/components/admin/charts/gauge";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import type { PlacementSummary } from "@/lib/admin/dashboard-overview-pure";

/**
 * Placements by payment: employer paid, and accepted but not yet paid. The centre is the share paid of
 * the total, and the two segments add up to that total. `summary` is null when the read failed.
 */
export function PlacementsGauge({ summary, href }: { summary: PlacementSummary | null; href: string | null }) {
  return (
    <Panel aria-labelledby="placements-title">
      <PanelHeader
        title={<span id="placements-title">Placements</span>}
        description={summary ? `${summary.total} in all` : undefined}
        linkHref={href ?? undefined}
        linkLabel="Open placements in the proposal pipeline"
      />
      <PanelBody className="pt-2">
        {summary ? (
          <Gauge
            segments={summary.segments}
            centerValue={`${summary.paidPct}%`}
            centerLabel="paid"
            ariaLabel="Placements by payment"
            className="max-w-[16rem] max-md:max-w-[11rem]"
          />
        ) : (
          <p role="alert" className="text-sm text-foreground">
            Couldn&apos;t load placements. Nothing was changed; reload to try again.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
