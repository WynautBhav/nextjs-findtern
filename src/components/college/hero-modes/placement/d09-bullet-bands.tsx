import type { PlacementData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, GOLD, MARKS_FILL, n, pct, Swatch, white } from "../kit";
import { OutcomeBar } from "./parts";

const OFFER = white(0.55);
const TRACK = white(0.1);

type Row = { key: string; name: string; fill: string | null; students: number; withOffer: number; hired: number; ppo: number };

/** A bullet: the track is the whole group; the wide bar is the offer rate, the narrow gold bar inside it the hire rate, the tick the PPO rate. */
function Bullet({ r }: { r: Row }) {
  const a = pct(r.withOffer, r.students);
  const h = pct(r.hired, r.students);
  const p = pct(r.ppo, r.students);
  return (
    <span className="relative block h-6" style={{ background: TRACK }} role="img" aria-label={`${r.name}: offer rate ${a}%, hire rate ${h}%, PPO rate ${p}%`}>
      <span className="absolute inset-y-1 left-0" style={{ width: `${a}%`, background: OFFER }} />
      <span className="absolute inset-y-2 left-0" style={{ width: `${h}%`, background: GOLD }} />
      {r.ppo ? <span className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `calc(${p}% - 1px)` }} /> : null}
    </span>
  );
}

/** A score on a 0 to 10 axis: the bar is the average, the strip under it the bands that axis is cut into, with the students in each. */
function ScoreBullet({ label, avg, strip }: { label: string; avg: number | null; strip: { name: string; range: string; from: number; to: number; fill: string; students: number }[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-on-dark-subtle">{label}</p>
        <p className="nums text-[1.75rem] font-light leading-none tracking-[-0.03em] text-white">{avg === null ? "-" : avg.toFixed(1)}</p>
      </div>
      <span className="relative mt-2 block h-3" style={{ background: TRACK }} role="img" aria-label={`${label}: ${avg === null ? "none" : avg.toFixed(1)} out of 10`}>
        {avg !== null ? <span className="absolute inset-y-0 left-0 bg-white" style={{ width: `${avg * 10}%` }} /> : null}
      </span>
      <span className="mt-1 flex h-1.5 gap-0.5" aria-hidden>
        {strip.map((s) => (
          <span key={s.name} style={{ width: `${(s.to - s.from) * 10}%`, background: s.fill }} />
        ))}
      </span>
      {/* Band names as a wrapping legend: a 2-unit segment is too narrow to hold "Cappuccino" under it. */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-dark-subtle">
        {strip.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: s.fill }} />
            {s.name} <span className="nums text-white">{n(s.students)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Placement 9, "Bullet bands": one bullet chart per Findtern band and one for everyone, all on the same 0 to 100% axis:
 * the wide bar is the share with an offer, the gold bar the share hired, the tick the share with a PPO. On the right the
 * two scores are bullets on a 0 to 10 axis, with the bands of that axis under the bar and the students in each.
 */
export function BulletBands({ data }: { data: PlacementData }) {
  const rows: Row[] = [
    ...data.coffee.map((b) => ({ key: b.key, name: b.name, fill: COFFEE_FILL[b.key], students: b.students, withOffer: b.withOffer, hired: b.hired, ppo: b.ppo })),
    { key: "all", name: "All interviewed", fill: null, students: data.interviewed, withOffer: data.withOffer, hired: data.internships, ppo: data.ppo },
  ];
  const cuts = [0, 6, 8, 10];
  const coffeeStrip = data.coffee.map((b, i) => ({ name: b.name, range: b.range, from: cuts[i], to: cuts[i + 1], fill: COFFEE_FILL[b.key], students: b.students }));
  const lo = [0, 4, 6, 8, 10];
  const marksStrip = data.marks.map((m, i) => ({ name: m.name, range: m.range, from: lo[i], to: lo[i + 1], fill: MARKS_FILL[m.key], students: m.students }));
  const all = rows[3];
  return (
    <DesignFrame
      label="Offer, hire and PPO rates by Findtern band, with average scores"
      finding={
        <>
          {pct(all.hired, all.students)}% of {n(all.students)} interviewed students are hired: {pct(data.coffee[2].hired, data.coffee[2].students)}% in Latte, {pct(data.coffee[0].hired, data.coffee[0].students)}% in Espresso.
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-14 gap-y-7 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div>
          <div className="hidden items-end gap-4 pb-1.5 text-xs text-on-dark-subtle sm:grid sm:grid-cols-[10rem_minmax(0,1fr)_9.75rem]">
            <span />
            <span className="nums flex justify-between"><span>0%</span><span>50%</span><span>100% of the group</span></span>
            <span className="grid grid-cols-3 text-right"><span>Offer</span><span>Hired</span><span>PPO</span></span>
          </div>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[10rem_minmax(0,1fr)_9.75rem]">
                <p className="flex min-w-0 items-center gap-2 text-sm text-white sm:order-1">
                  {r.fill ? <Swatch fill={r.fill} /> : <span className="size-2.5 shrink-0" />}
                  <span className="truncate">{r.name}</span>
                  <span className="nums text-xs text-on-dark-subtle">{n(r.students)}</span>
                </p>
                <p className="nums flex gap-x-3 text-right text-sm text-white sm:order-3 sm:grid sm:grid-cols-3 sm:gap-x-0">
                  {[
                    [r.withOffer, "offer"],
                    [r.hired, "hired"],
                    [r.ppo, "PPO"],
                  ].map(([v, w]) => (
                    <span key={w as string} className="sm:text-right">
                      {n(v as number)}
                      <span className="ml-1 text-xs text-on-dark-subtle sm:hidden">{w}</span>
                    </span>
                  ))}
                </p>
                <div className="col-span-2 sm:order-2 sm:col-span-1">
                  <Bullet r={r} />
                </div>
              </li>
            ))}
          </ul>
          <ul className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-on-dark-subtle">
            <li className="flex items-center gap-1.5"><Swatch fill={OFFER} />Got an offer</li>
            <li className="flex items-center gap-1.5"><Swatch fill={GOLD} />Hired</li>
            <li className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-0.5 bg-white" />PPO</li>
          </ul>
        </div>
        <div className="grid content-start gap-y-6">
          <ScoreBullet label="Avg CGPA / % out of 10" avg={data.avgMarks} strip={marksStrip} />
          <ScoreBullet label="Avg Findtern score out of 10" avg={data.avgScore} strip={coffeeStrip} />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 items-end gap-x-12 gap-y-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div>
          <p className="text-[13px] text-on-dark-subtle">AI interview done</p>
          <p className="nums mt-1 text-[1.75rem] font-light leading-none tracking-[-0.03em] text-white">{n(data.interviewed)}</p>
        </div>
        <div>
          <p className="mb-2 text-[13px] text-on-dark-subtle">
            Offers received <span className="nums ml-1 text-white">{n(data.offers.received)}</span>
          </p>
          <OutcomeBar data={data} />
        </div>
      </div>
    </DesignFrame>
  );
}
