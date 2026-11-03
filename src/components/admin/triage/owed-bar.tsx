import { Reveal } from "@/components/admin/motion";
import { barColor } from "./format";

export type BarSegment = { key: string; count: number; flag: boolean };

/**
 * The owed bar, the dashboard's one signature move: a flat 10px bar with a
 * segment per non-empty queue, as wide as its share of what needs you.
 *
 * Transform only, never width. Each segment is two layers: the outer one is
 * moved to its offset with `translateX(offset%)` (a % of the bar, because the
 * layer is as wide as the bar), the inner one is `scaleX(share)` from the left
 * edge, so `Reveal` can grow it from zero (40ms a step, 260ms each, about
 * 500ms for seven) with both ends being scale lists that interpolate cleanly.
 * When a count drops, both transform and the share change and the segment
 * shrinks over 260ms. The 2px gap is an inset shadow in the ground colour
 * whose offset is divided by the share, so it lands at 2px after the scale.
 *
 * Decorative: the counts are in the filter row below. An empty queue is a 1px
 * dashed zero line, not a missing chart.
 */
export function OwedBar({ segments }: { segments: BarSegment[] }) {
  const live = segments.filter((s) => s.count > 0);
  const total = live.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <div aria-hidden className="flex h-2.5 items-center">
        <div className="w-full border-t border-dashed border-text-subtle/50" />
      </div>
    );
  }

  // Offset and tone step of each segment, computed up front (cumulative share; non-flag rank).
  const placed = live.map((s, i) => ({
    ...s,
    share: s.count / total,
    at: live.slice(0, i).reduce((sum, p) => sum + p.count, 0) / total,
    step: live.slice(0, i).filter((p) => !p.flag).length,
  }));
  return (
    <div aria-hidden data-testid="owed-bar" className="relative h-2.5 w-full">
      {placed.map((s, i) => {
        const { share, at } = s;
        const color = barColor(s.step, s.flag);
        return (
          <div
            key={s.key}
            className="absolute inset-0 transition-transform duration-(--duration-admin-slow) ease-(--ease-out-soft)"
            style={{ transform: `translateX(${(at * 100).toFixed(4)}%)` }}
          >
            <Reveal
              index={i}
              className="h-full w-full transition-transform duration-(--duration-admin-slow) ease-(--ease-out-soft)"
              style={{
                transform: `scaleX(${share.toFixed(5)})`,
                backgroundColor: color,
                boxShadow: `inset -${(2 / share).toFixed(2)}px 0 0 0 var(--admin-panel)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
