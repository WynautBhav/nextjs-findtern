import type { CoffeeKey, PlacementData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, Legend, n, OUTCOME_FILL, pct, Swatch, white } from "../kit";
import { MarksBar, OUTCOMES } from "./parts";

const TILE = { background: white(0.07) };

/** A tile: the figure, and under it the same figure split by Findtern band (a bar, then the three counts). */
function BandTile({ label, total, split, gold = false, data }: { label: string; total: number; split: (b: PlacementData["coffee"][number]) => number; gold?: boolean; data: PlacementData }) {
  const parts = data.coffee.map((b) => ({ key: b.key as CoffeeKey, name: b.name, v: split(b) }));
  return (
    <div className="min-w-0 rounded-xl p-4" style={TILE}>
      <p className="text-[13px] text-on-dark-subtle">{label}</p>
      <p className={`nums mt-1.5 text-[2.5rem] font-light leading-none tracking-[-0.03em] ${gold ? "text-accent-300" : "text-white"}`}>{n(total)}</p>
      <div className="mt-4 flex h-2 gap-0.5 overflow-hidden" role="img" aria-label={`${label} by Findtern band: ${parts.map((p) => `${p.name} ${p.v}`).join(", ")}`}>
        {parts.map((p) => (p.v ? <span key={p.key} style={{ flexGrow: p.v, flexBasis: 0, background: COFFEE_FILL[p.key] }} /> : null))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-hidden>
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <Swatch fill={COFFEE_FILL[p.key]} className="size-2" />
            <span className="nums text-white">{n(p.v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Placement 7, "Scoreboard": a match board. Four tiles for the students (interviewed, with an offer, hired, PPO), each
 * split by Findtern band; one wide tile for the offers and how they ended; one for the scores.
 */
export function Scoreboard({ data }: { data: PlacementData }) {
  const o = data.offers;
  const parts = OUTCOMES(o);
  return (
    <DesignFrame
      label="Scoreboard of interviews, offers, internships and PPOs"
      finding={
        <>
          Offers stand at {n(o.accepted)} accepted, {n(o.rejected)} rejected and {n(o.notAnswered)} unanswered, from {n(data.interviewed)} interviewed students.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-dark-subtle">
        Bar and dots in the first row are the Findtern band:
        <Legend items={data.coffee.map((b) => ({ label: b.name, fill: COFFEE_FILL[b.key] }))} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <BandTile label="AI interview done" total={data.interviewed} split={(b) => b.students} data={data} />
        <BandTile label="Got an offer" total={data.withOffer} split={(b) => b.withOffer} data={data} />
        <BandTile label="Got internships" total={data.internships} split={(b) => b.hired} gold data={data} />
        <BandTile label="PPO, full-time offers" total={data.ppo} split={(b) => b.ppo} data={data} />
      </div>
      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 rounded-xl p-4" style={TILE}>
          <p className="text-[13px] text-on-dark-subtle">
            Offers received <span className="nums ml-1 text-white">{n(o.received)}</span>
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {parts.map((p) => (
              <li key={p.key} className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-on-dark-subtle">
                  <Swatch fill={OUTCOME_FILL[p.key]} className="size-2" />
                  {p.key === "withdrawn" ? "Withdrawn" : p.label}
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className={`nums text-[2.5rem] font-light leading-none tracking-[-0.03em] ${p.key === "accepted" ? "text-accent-300" : "text-white"}`}>{n(p.v)}</span>
                  <span className="nums text-xs text-on-dark-subtle">{pct(p.v, o.received)}%</span>
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex h-2 gap-0.5 overflow-hidden" role="img" aria-label={parts.map((p) => `${p.label} ${p.v}`).join(", ")}>
            {parts.map((p) => (p.v ? <span key={p.key} style={{ flexGrow: p.v, flexBasis: 0, background: OUTCOME_FILL[p.key] }} /> : null))}
          </div>
        </div>
        <div className="min-w-0 rounded-xl p-4" style={TILE}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="whitespace-nowrap text-[13px] text-on-dark-subtle">Avg CGPA / % of 10</p>
              <p className="nums mt-1.5 text-[2.5rem] font-light leading-none tracking-[-0.03em] text-white">{data.avgMarks === null ? "-" : data.avgMarks.toFixed(1)}</p>
            </div>
            <div>
              <p className="whitespace-nowrap text-[13px] text-on-dark-subtle">Avg Findtern score</p>
              <p className="nums mt-1.5 text-[2.5rem] font-light leading-none tracking-[-0.03em] text-white">{data.avgScore === null ? "-" : data.avgScore.toFixed(1)}</p>
            </div>
          </div>
          <MarksBar data={data} className="mt-4" />
        </div>
      </div>
    </DesignFrame>
  );
}
