import type { PlacementData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, GOLD, n, OUTCOME_FILL, white } from "../kit";
import { onFill, OUTCOMES, Scores } from "./parts";

const ROWS = 4;
const PITCH = 10;
const DOT = 7.5;

/** One floor of the tower: a block of windows, one per student, four rows high, as wide as its count. */
function Floor({ label, v, cols, max, fill }: { label: string; v: number; cols: number; max: number; fill: string }) {
  const w = max * PITCH;
  const dots = Array.from({ length: v }, (_, i) => ({ x: Math.floor(i / ROWS) * PITCH, y: (i % ROWS) * PITCH }));
  const used = cols * PITCH;
  return (
    <div>
      <p className="flex items-baseline gap-2 text-[13px] text-on-dark-subtle">
        {label}
        <span className="nums text-lg font-light text-white">{n(v)}</span>
      </p>
      <svg aria-hidden viewBox={`0 0 ${w} ${ROWS * PITCH - (PITCH - DOT)}`} className="mt-1 block w-full">
        <g transform={`translate(${(w - used) / 2} 0)`}>
          {dots.map((d, i) => (
            <rect key={i} x={d.x} y={d.y} width={DOT} height={DOT} fill={fill} />
          ))}
        </g>
      </svg>
    </div>
  );
}

/**
 * Placement 3, "Funnel tower": the interviewed students as one tower of windows (a window per student), each floor
 * narrowing to the students who got an offer, an internship and a PPO. Beside it the offers as a low block split by
 * outcome, and the three Findtern bands as a small skyline with height for students in the band.
 */
export function FunnelTower({ data }: { data: PlacementData }) {
  const o = data.offers;
  const inter = data.interviewed;
  const cols = (v: number) => Math.ceil(v / ROWS);
  const max = Math.max(cols(inter), 1);
  const parts = OUTCOMES(o);
  const top = Math.max(...data.coffee.map((b) => b.students), 1);
  return (
    <DesignFrame
      label="Tower of students from AI interview to PPO, with offers and bands"
      finding={
        <>
          Each window is one student: of {n(inter)} interviewed, {n(data.withOffer)} hold an offer, {n(data.internships)} are hired and {n(data.ppo)} have a PPO.
        </>
      }
    >
      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
        <div className="flex flex-col justify-end gap-2" role="img" aria-label={`Students: interviewed ${inter}, got an offer ${data.withOffer}, hired ${data.internships}, PPO ${data.ppo}`}>
          <Floor label="PPO, full-time offer" v={data.ppo} cols={cols(data.ppo)} max={max} fill={GOLD} />
          <Floor label="Got internships" v={data.internships} cols={cols(data.internships)} max={max} fill={GOLD} />
          <Floor label="Got an offer" v={data.withOffer} cols={cols(data.withOffer)} max={max} fill={white(0.72)} />
          <Floor label="AI interview done" v={inter} cols={cols(inter)} max={max} fill={white(0.38)} />
        </div>
        <div className="flex flex-col">
          <p className="text-[13px] text-on-dark-subtle">
            Offers received <span className="nums ml-1 text-lg font-light text-white">{n(o.received)}</span>
          </p>
          <div className="mt-2 flex h-[210px] flex-col gap-0.5" role="img" aria-label={parts.map((p) => `${p.label} ${p.v}`).join(", ")}>
            {parts.map((p) =>
              p.v ? (
                <div key={p.key} className="flex min-h-7 items-center justify-between gap-2 px-3 text-xs" style={{ flexGrow: p.v, flexBasis: 0, background: OUTCOME_FILL[p.key], color: onFill(OUTCOME_FILL[p.key]) }}>
                  <span>{p.label}</span>
                  <span className="nums text-sm font-medium">{n(p.v)}</span>
                </div>
              ) : null,
            )}
          </div>
          {parts.some((p) => !p.v) ? <p className="nums mt-2 text-xs text-on-dark-subtle">{parts.filter((p) => !p.v).map((p) => `${p.label} 0`).join(", ")}</p> : null}
        </div>
        <div>
          <p className="text-[13px] text-on-dark-subtle">Findtern band of the {n(inter)} interviewed</p>
          <div className="mt-2 grid grid-cols-3 items-end gap-1.5">
            {data.coffee.map((b) => (
              <div key={b.key} className="min-w-0">
                <p className="nums mb-1 text-center text-lg font-light text-white">{n(b.students)}</p>
                <div style={{ height: Math.max(2, Math.round((b.students / top) * 170)), background: COFFEE_FILL[b.key] }} />
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-xs text-on-dark-subtle">
            {data.coffee.map((b) => (
              <p key={b.key} className="min-w-0">
                <span className="block text-white">{b.name}</span>
                <span className="nums">{n(b.hired)} hired</span>
              </p>
            ))}
          </div>
        </div>
      </div>
      <Scores data={data} className="mt-6" />
    </DesignFrame>
  );
}
