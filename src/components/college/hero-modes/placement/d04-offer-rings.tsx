import type { PlacementData } from "@/lib/college/overview-modes";
import { DesignFrame, GOLD, n, OUTCOME_FILL, pct, Swatch, white } from "../kit";
import { BandBar, OUTCOMES, Scores } from "./parts";

const C = 160;
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
function arc(r: number, a0: number, a1: number) {
  if (a1 - a0 >= 359.9) return `M${C},${C - r} A${r},${r} 0 1 1 ${C - 0.01},${C - r}`;
  const [x0, y0] = [C + r * Math.cos(rad(a0)), C + r * Math.sin(rad(a0))];
  const [x1, y1] = [C + r * Math.cos(rad(a1)), C + r * Math.sin(rad(a1))];
  return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`;
}

function Row({ fill, label, v, of }: { fill: string; label: string; v: number; of: number }) {
  return (
    <li className="grid grid-cols-[auto_1fr_auto_3rem] items-baseline gap-x-2.5 text-sm">
      <Swatch fill={fill} className="translate-y-px" />
      <span className="text-on-dark-subtle">{label}</span>
      <span className="nums text-white">{n(v)}</span>
      <span className="nums text-right text-xs text-on-dark-subtle">{pct(v, of)}%</span>
    </li>
  );
}

/**
 * Placement 4, "Offer rings": four thin rings drawn out from the centre. The outer ring is every offer, split by what
 * happened to it. The three inner rings are shares of the interviewed students: those who got an offer, those hired
 * and those with a PPO. The table beside it carries every figure; the ring carries the shape.
 */
export function OfferRings({ data }: { data: PlacementData }) {
  const o = data.offers;
  const inter = data.interviewed;
  const parts = OUTCOMES(o);
  const GAPDEG = parts.filter((p) => p.v).length > 1 ? 2 : 0;
  const segs = parts.map((p, i) => {
    const before = parts.slice(0, i).reduce((t, q) => t + q.v, 0);
    const a0 = o.received ? (before / o.received) * 360 : 0;
    const span = o.received ? (p.v / o.received) * 360 : 0;
    return { ...p, a0: a0 + GAPDEG / 2, a1: a0 + span - GAPDEG / 2 };
  });
  const inner = [
    { r: 120, label: "Got an offer", v: data.withOffer, fill: white(0.72) },
    { r: 104, label: "Got internships", v: data.internships, fill: GOLD },
    { r: 88, label: "PPO, full-time offers", v: data.ppo, fill: GOLD },
  ];
  return (
    <DesignFrame
      label="Offers by outcome and students by stage, drawn as rings"
      finding={
        <>
          {n(o.received)} offers reached {n(data.withOffer)} students, {pct(o.accepted, o.received)}% of them accepted, and {n(data.internships)} students are hired.
        </>
      }
    >
      <div className="grid items-center gap-x-12 gap-y-6 lg:grid-cols-[19rem_1fr]">
        <div className="relative mx-auto aspect-square w-full max-w-[19rem]">
          <svg aria-hidden viewBox="0 0 320 320" className="size-full">
            <circle cx={C} cy={C} r={140} fill="none" stroke={white(0.08)} strokeWidth={14} />
            {segs.map((s) => (s.v ? <path key={s.key} d={arc(140, s.a0, s.a1)} fill="none" stroke={OUTCOME_FILL[s.key]} strokeWidth={14} /> : null))}
            {inner.map((ring) => (
              <g key={ring.label}>
                <circle cx={C} cy={C} r={ring.r} fill="none" stroke={white(0.08)} strokeWidth={8} />
                {ring.v && inter ? <path d={arc(ring.r, 0, Math.min(359.95, (ring.v / inter) * 360))} fill="none" stroke={ring.fill} strokeWidth={8} /> : null}
              </g>
            ))}
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <p className="nums text-[2.5rem] font-light leading-none tracking-[-0.03em] text-white">{n(inter)}</p>
            <p className="mt-1 text-[13px] text-on-dark-subtle">AI interview done</p>
          </div>
        </div>
        <div className="grid min-w-0 gap-x-10 gap-y-6 sm:grid-cols-2">
          <div>
            <p className="mb-2.5 text-[13px] text-on-dark-subtle">
              Outer ring: <span className="nums text-white">{n(o.received)}</span> offers received
            </p>
            <ul className="space-y-1.5" aria-label="Offers by outcome">
              {parts.map((p) => (
                <Row key={p.key} fill={OUTCOME_FILL[p.key]} label={p.label} v={p.v} of={o.received} />
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2.5 text-[13px] text-on-dark-subtle">Inner rings: share of the {n(inter)} interviewed</p>
            <ul className="space-y-1.5" aria-label="Students by stage">
              {inner.map((r) => (
                <Row key={r.label} fill={r.fill} label={r.label} v={r.v} of={inter} />
              ))}
            </ul>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-[13px] text-on-dark-subtle">Findtern band of the {n(inter)} interviewed</p>
            <BandBar data={data} />
          </div>
          <Scores data={data} className="sm:col-span-2" />
        </div>
      </div>
    </DesignFrame>
  );
}
