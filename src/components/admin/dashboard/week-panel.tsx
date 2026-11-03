import { PillBars } from "@/components/admin/charts/pill-bars";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import type { WeekBar } from "@/lib/admin/dashboard-overview-pure";
import { cn } from "@/lib/utils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Proposals created per day of the current India week, Monday to Sunday. With two or more busy days it is
 * the pill bar chart (today filled, days to come hatched). With one busy day or none, a chart of one bar
 * and six stubs says nothing, so the card shows the figure and a seven-day tick row instead.
 * `data` is null when the read failed: the panel says so instead of drawing a flat week.
 */
export function WeekPanel({ data, href }: { data: { bars: WeekBar[]; total: number } | null; href: string | null }) {
  const busy = data ? data.bars.filter((b) => b.value > 0) : [];
  return (
    <Panel aria-labelledby="week-title">
      <PanelHeader
        title={<span id="week-title">Proposals this week</span>}
        description={data ? "Monday to Sunday, India time" : undefined}
        linkHref={href ?? undefined}
        linkLabel="Open the proposal pipeline"
      />
      <PanelBody className="pt-2">
        {!data ? (
          <p role="alert" className="text-sm text-foreground">
            Couldn&apos;t load this week&apos;s proposals. Nothing was changed; reload to try again.
          </p>
        ) : busy.length >= 2 ? (
          <>
            <p className="nums text-[2rem] font-semibold leading-none tracking-[-0.03em] text-foreground">{data.total.toLocaleString("en-IN")}</p>
            <p className="mb-1 mt-1 text-sm text-text-subtle">sent since Monday</p>
            <PillBars data={data.bars} unit="proposals" ariaLabel="Proposals created per day this week" height={150} />
          </>
        ) : (
          <>
            <p className="nums text-[2rem] font-semibold leading-none tracking-[-0.03em] text-foreground">{data.total.toLocaleString("en-IN")}</p>
            <p className="mt-1 text-sm text-text-subtle">
              {data.total === 0
                ? "No proposals sent yet this week"
                : `sent since Monday, all on ${DAYS[data.bars.findIndex((b) => b.value > 0)] ?? "one day"}`}
            </p>
            <ol aria-label="Days of this week" className="mt-4 grid grid-cols-7 gap-1.5">
              {data.bars.map((b, i) => (
                <li key={`${b.label}-${i}`} className="text-center">
                  <span
                    aria-hidden
                    className={cn(
                      "block h-2 rounded-full",
                      b.value > 0 ? "bg-[color:var(--admin-tile)]" : b.state === "future" ? "border border-dashed border-[color:var(--admin-hatch)]" : "bg-[color:var(--admin-panel-2)]",
                    )}
                  />
                  <span className={cn("mt-1 block text-xs", b.state === "today" ? "font-semibold text-foreground" : "text-text-subtle")}>{b.label}</span>
                  <span className="sr-only">
                    {DAYS[i]}: {b.value}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
