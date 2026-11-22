import type { CategoriesData } from "@/lib/college/overview-modes";
import { DesignFrame, n } from "../kit";
import { arcPath, BandFigures, finding, Lead, MarksInline, NOT_YET, segments, YearInline } from "./parts";

/**
 * Categories 7, "Bubbles": one bubble per degree, its area the degree's students, packed into a cluster. A thin ring
 * round each bubble is split by Findtern band (gold Latte first, clockwise from twelve); the name and the student count
 * sit in the hole. The ring's arcs sum to the bubble's students.
 */
const RMAX = 100;
const GAP = 8;

type Placed = { x: number; y: number; r: number };

/** Greedy tangent packing, widest-first, biased to a wide cluster. Deterministic. */
function pack(radii: number[]): Placed[] {
  const out: Placed[] = [];
  for (const r of radii) {
    if (!out.length) {
      out.push({ x: 0, y: 0, r });
      continue;
    }
    let best: Placed | null = null;
    let bestScore = Infinity;
    for (const p of out) {
      for (let a = 0; a < 360; a += 6) {
        const rad = (a * Math.PI) / 180;
        const x = p.x + (p.r + r + GAP) * Math.cos(rad);
        const y = p.y + (p.r + r + GAP) * Math.sin(rad);
        if (out.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + r + GAP - 0.5)) continue;
        const score = (x * 0.55) ** 2 + y ** 2;
        if (score < bestScore) {
          bestScore = score;
          best = { x, y, r };
        }
      }
    }
    out.push(best ?? { x: out.length * RMAX * 2, y: 0, r });
  }
  return out;
}

export function Bubbles({ data }: { data: CategoriesData }) {
  const maxS = Math.max(1, ...data.degrees.map((d) => d.students));
  const order = data.degrees.map((d, i) => ({ d, i })).sort((a, b) => b.d.students - a.d.students);
  const placed = pack(order.map(({ d }) => Math.max(14, RMAX * Math.sqrt(d.students / maxS))));
  const minX = Math.min(...placed.map((p) => p.x - p.r)) - 4;
  const maxX = Math.max(...placed.map((p) => p.x + p.r)) + 4;
  const minY = Math.min(...placed.map((p) => p.y - p.r)) - 4;
  const maxY = Math.max(...placed.map((p) => p.y + p.r)) + 4;
  const W = maxX - minX;
  const H = maxY - minY;
  return (
    <DesignFrame label="One bubble per degree, ringed by Findtern band" finding={finding(data, "degree")}>
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_21rem]">
        <div className="relative mx-auto w-full max-w-[34rem]" style={{ aspectRatio: `${W} / ${H}`, maxHeight: "20rem" }}>
          <svg viewBox={`${minX} ${minY} ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden>
            {placed.map((p, k) => {
              const { d } = order[k];
              let at = 0;
              return (
                <g key={d.name}>
                  {d.students === 0 ? (
                    <circle cx={p.x} cy={p.y} r={p.r} fill="none" stroke={NOT_YET} strokeWidth="5" />
                  ) : (
                    segments(d).map((s, j) => {
                      if (s.count === 0) return null;
                      const t0 = at;
                      at += s.count / d.students;
                      return <path key={j} d={arcPath(p.x, p.y, p.r * 0.8, p.r, t0, at)} fill={s.fill} fillRule="evenodd" className="dot-drop" />;
                    })
                  )}
                </g>
              );
            })}
          </svg>
          {placed.map((p, k) => {
            const { d } = order[k];
            return (
              <div
                key={d.name}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                style={{ left: `${((p.x - minX) / W) * 100}%`, top: `${((p.y - minY) / H) * 100}%`, width: `${((p.r * 1.5) / W) * 100}%` }}
              >
                <p className="truncate text-sm text-white">{d.name}</p>
                <p className="nums text-base font-light leading-tight text-white">{n(d.students)}</p>
                <p className="nums hidden text-[11px] text-on-dark-subtle sm:block">{n(d.interviewed)} done</p>
              </div>
            );
          })}
        </div>
        <div className="min-w-0 space-y-5 max-lg:contents">
          <Lead data={data} className="max-lg:order-first" />
          <BandFigures data={data} withNotYet />
          <MarksInline data={data} />
          <YearInline data={data} />
        </div>
      </div>
    </DesignFrame>
  );
}
