import type { PlacementData } from "@/lib/college/overview-modes";
import { DesignFrame, GOLD, n, Swatch, white } from "../kit";
import { goldA, OutcomeBar, Scores } from "./parts";

const STEPS = [
  { key: "ppo", label: "PPO, full-time offer", fill: GOLD },
  { key: "hired", label: "Hired, no PPO", fill: goldA(0.62) },
  { key: "offer", label: "Offer, not hired", fill: white(0.55) },
  { key: "none", label: "No offer yet", fill: white(0.12) },
] as const;
type Step = (typeof STEPS)[number]["key"];

/** Split a group into its furthest step reached. PPO is inside hired, hired inside offer, offer inside the group. */
function steps(students: number, withOffer: number, hired: number, ppo: number): Record<Step, number> {
  const h = Math.min(hired, students);
  const w = Math.min(Math.max(withOffer, h), students);
  const p = Math.min(ppo, h);
  return { ppo: p, hired: h - p, offer: w - h, none: students - w };
}

/** Cells (out of 100) per step by largest remainder, so the grid always holds exactly 100. */
function cells(s: Record<Step, number>, total: number): Record<Step, number> {
  if (!total) return { ppo: 0, hired: 0, offer: 0, none: 0 };
  const raw = STEPS.map((st) => ({ k: st.key, exact: (s[st.key] / total) * 100 }));
  const out = Object.fromEntries(raw.map((r) => [r.k, Math.floor(r.exact)])) as Record<Step, number>;
  let left = 100 - Object.values(out).reduce((a, b) => a + b, 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left <= 0) break;
    out[r.k]++;
    left--;
  }
  return out;
}

function Waffle({ s, total, className, label }: { s: Record<Step, number>; total: number; className?: string; label: string }) {
  const c = cells(s, total);
  const seq: string[] = [];
  for (const st of STEPS) for (let i = 0; i < c[st.key]; i++) seq.push(st.fill);
  const grid = total ? seq : Array.from({ length: 100 }, () => white(0.06));
  return (
    <svg role="img" aria-label={label} viewBox="0 0 100 100" className={className}>
      {grid.map((fill, i) => (
        <rect key={i} x={(i % 10) * 10} y={Math.floor(i / 10) * 10} width={8.4} height={8.4} fill={fill} />
      ))}
    </svg>
  );
}

/**
 * Placement 6, "Student waffle": a 10 by 10 grid where each square is 1% of the interviewed students, coloured by the
 * furthest step that student reached: PPO, hired, an offer, or none yet. The three Findtern bands each get a small
 * grid of their own, so the bands can be compared by colour. Offers by outcome and the scores sit underneath.
 */
export function StudentWaffle({ data }: { data: PlacementData }) {
  const inter = data.interviewed;
  const all = steps(inter, data.withOffer, data.internships, data.ppo);
  const per = inter / 100;
  return (
    <DesignFrame
      label="Interviewed students coloured by the furthest step they reached"
      finding={
        <>
          Of {n(inter)} interviewed students, {n(all.ppo)} reached a PPO, {n(all.hired)} more are hired, {n(all.offer)} hold an offer and {n(all.none)} have none yet.
        </>
      }
    >
      <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[13rem_1fr]">
        <div>
          <p className="mb-2 text-[13px] text-on-dark-subtle">
            AI interview done <span className="nums ml-1 text-lg font-light text-white">{n(inter)}</span>
          </p>
          <Waffle s={all} total={inter} label={`Interviewed students by furthest step: ${STEPS.map((st) => `${st.label} ${all[st.key]}`).join(", ")}`} className="block aspect-square w-full max-w-[13rem]" />
          <p className="nums mt-2 text-xs text-on-dark-subtle">Each square is {per ? per.toFixed(1) : "0"} students</p>
        </div>
        <div className="min-w-0">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2.5 sm:grid-cols-4" aria-label="Furthest step reached">
            {STEPS.map((st) => (
              <li key={st.key} className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-on-dark-subtle">
                  <Swatch fill={st.fill} className="size-2.5 rounded-none" />
                  {st.label}
                </p>
                <p className={`nums mt-1 text-[1.75rem] font-light leading-none tracking-[-0.03em] ${st.key === "ppo" ? "text-accent-300" : "text-white"}`}>{n(all[st.key])}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[13px] text-on-dark-subtle">By Findtern band, each grid is the band</p>
          <div className="mt-2 grid grid-cols-3 gap-x-4 sm:gap-x-8">
            {data.coffee.map((b) => {
              const s = steps(b.students, b.withOffer, b.hired, b.ppo);
              return (
                <div key={b.key} className="min-w-0">
                  <Waffle s={s} total={b.students} label={`${b.name}: ${STEPS.map((st) => `${st.label} ${s[st.key]}`).join(", ")}`} className="block aspect-square w-full max-w-[7.5rem]" />
                  <p className="mt-2 text-sm text-white">{b.name}</p>
                  <p className="nums text-xs text-on-dark-subtle">
                    {n(b.students)} students, {n(b.hired)} hired
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-7 grid gap-x-12 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <p className="mb-2 text-[13px] text-on-dark-subtle">
            Offers received <span className="nums ml-1 text-white">{n(data.offers.received)}</span>
          </p>
          <OutcomeBar data={data} />
        </div>
        <Scores data={data} />
      </div>
    </DesignFrame>
  );
}
