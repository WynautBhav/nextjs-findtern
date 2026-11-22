import type { BandCount, CoffeeKey, PlacementData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, GOLD, Legend, n, pct, white } from "../kit";
import { OutcomeBar, Scores } from "./parts";

const OFFER = white(0.4);
const BODY = "M30 60 H130 L122 140 Q120 162 100 162 H60 Q40 162 38 140 Z";
const TOP = 60;
const BOTTOM = 162;

function steam(count: number) {
  const k = Math.min(count, 24);
  return Array.from({ length: k }, (_, i) => {
    const x = k === 1 ? 80 : 42 + (i * 76) / (k - 1);
    const rise = 18 + ((i * 7) % 5) * 6;
    const sway = i % 2 ? 4 : -4;
    return `M${x.toFixed(1)} 54 q${sway} ${-rise / 2} 0 ${-rise / 2} t0 ${-rise / 2}`;
  });
}

function Cup({ b }: { b: BandCount<CoffeeKey> }) {
  const id = `p8-cup-${b.key}`;
  const level = (v: number) => (BOTTOM - TOP) * (b.students ? v / b.students : 0);
  const offerH = level(b.withOffer);
  const hiredH = level(b.hired);
  return (
    <div role="group" className="min-w-0" aria-label={`${b.name}: ${b.students} students, ${b.withOffer} with an offer, ${b.hired} hired, ${b.ppo} PPO`}>
      <svg aria-hidden viewBox="0 0 160 176" className="mx-auto block w-full max-w-[11rem]">
        <defs>
          <clipPath id={id}>
            <path d={BODY} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id})`}>
          <rect x={20} y={TOP} width={120} height={BOTTOM - TOP} fill={white(0.06)} />
          <rect x={20} y={BOTTOM - offerH} width={120} height={offerH} fill={OFFER} />
          <rect x={20} y={BOTTOM - hiredH} width={120} height={hiredH} fill={GOLD} />
        </g>
        <path d={BODY} fill="none" stroke={COFFEE_FILL[b.key]} strokeWidth={3} strokeLinejoin="round" />
        <path d="M129 76 H142 Q152 76 152 90 Q152 106 138 106 L125 106" fill="none" stroke={COFFEE_FILL[b.key]} strokeWidth={3} strokeLinecap="round" />
        <rect x={24} y={168} width={112} height={4} fill={white(0.16)} />
        {steam(b.ppo).map((d, i) => (
          <path key={i} d={d} fill="none" stroke={GOLD} strokeWidth={1.4} strokeLinecap="round" />
        ))}
      </svg>
      <div className="mt-3 text-center">
        <p className="text-sm text-white">
          {b.name} <span className="text-xs text-on-dark-subtle">{b.range}</span>
        </p>
        <p className="nums mt-0.5 text-xs text-on-dark-subtle">{n(b.students)} students</p>
        <dl className="nums mx-auto mt-2 grid max-w-[10rem] grid-cols-[1fr_auto] gap-x-2 sm:grid-cols-[1fr_auto_auto] gap-y-0.5 text-xs">
          <dt className="text-left text-on-dark-subtle">Offer</dt>
          <dd className="text-white">{n(b.withOffer)}</dd>
          <dd className="hidden w-8 text-right text-on-dark-subtle sm:block">{pct(b.withOffer, b.students)}%</dd>
          <dt className="text-left text-on-dark-subtle">Hired</dt>
          <dd className="text-accent-300">{n(b.hired)}</dd>
          <dd className="hidden w-8 text-right text-on-dark-subtle sm:block">{pct(b.hired, b.students)}%</dd>
          <dt className="text-left text-on-dark-subtle">PPO</dt>
          <dd className="text-white">{n(b.ppo)}</dd>
          <dd className="hidden w-8 sm:block" />
        </dl>
      </div>
    </div>
  );
}

/**
 * Placement 8, "Coffee cups": each Findtern band is a cup. The cup is the band's students; it is filled to the share
 * with an offer (light) and to the share hired (gold); a steam line rises for every PPO. Totals and outcomes sit beside.
 */
export function CoffeeCups({ data }: { data: PlacementData }) {
  const lat = data.coffee.find((b) => b.key === "latte");
  return (
    <DesignFrame
      label="Findtern bands as cups filled to the hire rate"
      finding={
        <>
          {n(data.internships)} of {n(data.interviewed)} interviewed students are hired{lat ? `, ${n(lat.hired)} of them from Latte` : ""}, and {n(data.ppo)} have a PPO.
        </>
      }
    >
      <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div>
          <div className="grid grid-cols-3 gap-x-3 sm:gap-x-8">
            {data.coffee.map((b) => (
              <Cup key={b.key} b={b} />
            ))}
          </div>
          <Legend className="mt-4 justify-center" items={[{ label: "Got an offer", fill: OFFER }, { label: "Hired", fill: GOLD }, { label: "One steam line per PPO", fill: GOLD }]} />
        </div>
        <div className="grid min-w-0 content-start gap-y-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {[
              ["AI interview done", data.interviewed, false],
              ["Offers received", data.offers.received, false],
              ["Got internships", data.internships, true],
              ["PPO, full-time offers", data.ppo, false],
            ].map(([label, v, gold]) => (
              <div key={label as string}>
                <p className="text-[13px] text-on-dark-subtle">{label as string}</p>
                <p className={`nums mt-1 text-[1.75rem] font-light leading-none tracking-[-0.03em] ${gold ? "text-accent-300" : "text-white"}`}>{n(v as number)}</p>
              </div>
            ))}
          </div>
          <OutcomeBar data={data} />
          <Scores data={data} className="sm:grid-cols-2 [&>*:last-child]:sm:col-span-2" />
        </div>
      </div>
    </DesignFrame>
  );
}
