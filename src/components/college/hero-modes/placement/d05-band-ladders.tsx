import type { BandCount, CoffeeKey, PlacementData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, GOLD, n, pct, Swatch, white } from "../kit";
import { OutcomeBar, Scores } from "./parts";

const OFFER = white(0.55);
const TRACK = white(0.1);

/** One rung: the count over a bar that fills to its share of the band. A zero draws no bar. On a phone the rung is one row with its name. */
function Rung({ label, v, of, fill, share = true }: { label: string; v: number; of: number; fill: string; share?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5 sm:h-[52px] sm:flex-col sm:items-stretch sm:justify-end sm:gap-1.5 sm:py-0">
      <span className="w-24 shrink-0 text-xs text-on-dark-subtle sm:hidden">{label}</span>
      <p className="order-last flex min-w-[4.25rem] items-baseline justify-end gap-1.5 leading-none sm:order-none sm:min-w-0 sm:justify-start">
        <span className="nums text-base text-white">{n(v)}</span>
        {share ? <span className="nums text-xs text-on-dark-subtle">{pct(v, of)}%</span> : null}
      </p>
      <span className="block h-2.5 flex-1 sm:flex-none" style={{ background: TRACK }} aria-hidden>
        <span className="block h-full" style={{ width: `${pct(v, of)}%`, background: fill }} />
      </span>
    </div>
  );
}

function Ladder({ b }: { b: BandCount<CoffeeKey> }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-white">
        <Swatch fill={COFFEE_FILL[b.key]} className="translate-y-px" />
        {b.name}
        <span className="text-xs text-on-dark-subtle">{b.range}</span>
      </p>
      {/* The two rails are the band's own colour; the rungs between them climb from everyone in the band to the PPOs. */}
      <div className="relative mt-3 px-3.5">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: COFFEE_FILL[b.key] }} />
        <span aria-hidden className="absolute inset-y-0 right-0 w-[3px]" style={{ background: COFFEE_FILL[b.key] }} />
        <Rung label="PPO, full-time" v={b.ppo} of={b.students} fill={GOLD} />
        <Rung label="Hired" v={b.hired} of={b.students} fill={GOLD} />
        <Rung label="Got an offer" v={b.withOffer} of={b.students} fill={OFFER} />
        <Rung label="In the band" v={b.students} of={b.students} fill={COFFEE_FILL[b.key]} share={false} />
      </div>
    </div>
  );
}

/**
 * Placement 5, "Band ladders": each Findtern band is a ladder with four rungs, climbed from the bottom. The first rung
 * is everyone in the band, then those with an offer, the hired, and the PPOs; each bar fills to its share of the band.
 * Below: the interviewed total, the offers by outcome, and the scores.
 */
export function BandLadders({ data }: { data: PlacementData }) {
  const lat = data.coffee.find((b) => b.key === "latte");
  return (
    <DesignFrame
      label="Findtern bands as ladders from interview to PPO"
      finding={
        lat ? (
          <>
            {n(lat.hired)} of {n(lat.students)} Latte students are hired ({pct(lat.hired, lat.students)}%), against {n(data.coffee[0].hired)} of {n(data.coffee[0].students)} in Espresso.
          </>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-[7rem_repeat(3,minmax(0,1fr))] sm:gap-x-8">
        <ul className="mt-[2.1rem] hidden flex-col sm:flex text-xs text-on-dark-subtle" aria-hidden>
          {[
            ["PPO, full-time", GOLD],
            ["Hired", GOLD],
            ["Got an offer", OFFER],
            ["In the band", null],
          ].map(([label, fill]) => (
            <li key={label as string} className="flex h-[52px] items-end gap-1.5 pb-px leading-none">
              {fill ? <Swatch fill={fill as string} className="size-2" /> : null}
              {label}
            </li>
          ))}
        </ul>
        {data.coffee.map((b) => (
          <Ladder key={b.key} b={b} />
        ))}
      </div>
      <div className="mt-7 grid gap-x-12 gap-y-5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.5fr)]">
        <div>
          <p className="text-[13px] text-on-dark-subtle">AI interview done</p>
          <p className="nums mt-1 text-[1.75rem] font-light leading-none tracking-[-0.03em] text-white">{n(data.interviewed)}</p>
          <p className="nums mt-1.5 text-xs text-on-dark-subtle">
            {n(data.internships)} internships, {n(data.ppo)} PPO
          </p>
        </div>
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
