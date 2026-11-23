import type { PlacementData } from "@/lib/college/overview-modes";
import { DesignFrame, GOLD, Legend, n, OUTCOME_FILL, white } from "../kit";
import { cn } from "@/lib/utils";
import { Averages, BandBar, goldA, MarksBar, Meetings, onFill } from "./parts";
import { DrillLink, type DrillFilters } from "../drill";

const W = 1000;
const H = 230;
const NW = 130;
const STEP = (W - NW) / 4;
const PAD = 5;
const GAP = 10;
const per = (total: number, avail: number) => (total ? avail / total : 0);

type Node = { id: string; label: string; short?: string; v: number; x: number; y: number; h: number; fill: string; below?: boolean };

/** What each block opens: the students behind it. Offer blocks count offers; the pop-up lists the students holding one. */
const DRILL: Record<string, { title: string; filters: DrillFilters }> = {
  i: { title: "Interviewed students", filters: { band: "done" } },
  o: { title: "Students who got an offer", filters: { placement: "offer" } },
  n: { title: "Interviewed, no offer yet", filters: { outcome: "no-offer" } },
  accepted: { title: "Students who accepted an offer", filters: { outcome: "accepted" } },
  notAnswered: { title: "Students with an offer not answered", filters: { outcome: "open" } },
  rejected: { title: "Students who rejected an offer", filters: { outcome: "rejected" } },
  withdrawn: { title: "Students with an offer withdrawn", filters: { outcome: "withdrawn" } },
  h: { title: "Students with an internship", filters: { placement: "hired" } },
  p: { title: "Students with a PPO offer", filters: { placement: "ppo" } },
};

function ribbon(x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) {
  const m = (x0 + x1) / 2;
  return `M${x0},${y0} C${m},${y0} ${m},${y1} ${x1},${y1} L${x1},${y1 + h1} C${m},${y1 + h1} ${m},${y0 + h0} ${x0},${y0 + h0} Z`;
}

/**
 * Placement 2, "Sankey flow": students flow left to right: interviewed, then split into got an offer and no offer; the
 * offers they hold (a student can hold several) split by what happened to each; accepted offers lead on to internships
 * and then PPOs. Student stages share one scale and offer stages another, joined where the offer node widens into its
 * four outcomes. Bands and scores sit under the flow.
 */
export function SankeyFlow({ data }: { data: PlacementData }) {
  const o = data.offers;
  const inter = data.interviewed;
  const offerS = Math.min(data.withOffer, inter);
  const noOfferS = inter - offerS;
  const s0 = per(inter, H - 2 * PAD);
  const s1 = per(inter, H - 2 * PAD - GAP);
  const so = per(o.received, H - 2 * PAD - 3 * GAP);

  const X = (i: number) => i * STEP;
  const interviewed: Node = { id: "i", label: "Interviewed", v: inter, x: X(0), y: PAD, h: inter * s0, fill: white(0.72) };
  const offer: Node = { id: "o", label: "Got an offer", v: offerS, x: X(1), y: PAD, h: offerS * s1, fill: white(0.38) };
  const none: Node = { id: "n", label: "No offer", v: noOfferS, x: X(1), y: PAD + offer.h + GAP, h: noOfferS * s1, fill: white(0.16) };
  let cy = PAD;
  const outs: Node[] = (
    [
      ["accepted", "Accepted", o.accepted],
      ["notAnswered", "Not answered", o.notAnswered],
      ["rejected", "Rejected", o.rejected],
      ["withdrawn", "Withdrawn", o.withdrawn],
    ] as const
  ).map(([k, label, v]) => {
    const nd: Node = { id: k, label, v, x: X(2), y: cy, h: v * so, fill: OUTCOME_FILL[k] };
    cy += nd.h + GAP;
    return nd;
  });
  const acc = outs[0];
  const hiredS = data.internships;
  const intern: Node = { id: "h", label: "Internships", v: hiredS, x: X(3), y: 28, h: hiredS * so, fill: GOLD, below: true };
  const ppo: Node = { id: "p", label: "PPO", v: data.ppo, x: X(4), y: 62, h: data.ppo * so, fill: GOLD, below: true };
  const nodes = [interviewed, offer, none, ...outs, intern, ppo];

  // Ribbons.
  const ribbons: { d: string; fill: string }[] = [];
  ribbons.push({ d: ribbon(interviewed.x + NW, interviewed.y, offer.h / s1 * s0, offer.x, offer.y, offer.h), fill: white(0.14) });
  ribbons.push({ d: ribbon(interviewed.x + NW, interviewed.y + (offerS * s0), noOfferS * s0, none.x, none.y, none.h), fill: white(0.06) });
  let sy = offer.y;
  for (const t of outs) {
    const sh = o.received ? (offer.h * t.v) / o.received : 0;
    ribbons.push({ d: ribbon(offer.x + NW, sy, sh, t.x, t.y, t.h), fill: t.id === "accepted" ? goldA(0.3) : white(0.08) });
    sy += sh;
  }
  const hSrc = Math.min(hiredS, o.accepted) * so;
  ribbons.push({ d: ribbon(acc.x + NW, acc.y, hSrc, intern.x, intern.y, intern.h), fill: goldA(0.3) });
  const pSrc = Math.min(data.ppo, hiredS) * so;
  ribbons.push({ d: ribbon(intern.x + NW, intern.y, pSrc, ppo.x, ppo.y, ppo.h), fill: goldA(0.3) });

  return (
    <DesignFrame
      label="Flow from AI interview to offers, internships and PPOs"
      finding={
        <>
          {n(data.withOffer)} of {n(inter)} interviewed students got an offer; {n(o.accepted)} of their {n(o.received)} offers were accepted and {n(data.internships)} became internships, {n(data.ppo)} with a PPO.
        </>
      }
    >
      <div className="relative" style={{ height: H }}>
        <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
          {ribbons.map((r, i) => (r.d ? <path key={i} d={r.d} fill={r.fill} /> : null))}
          {nodes.map((nd) => (
            <rect key={nd.id} x={nd.x} y={nd.y} width={NW} height={nd.h} fill={nd.fill} />
          ))}
        </svg>
        {nodes.map((nd) => {
          const style = { left: `${(nd.x / W) * 100}%`, width: `${(NW / W) * 100}%`, top: `${((nd.below ? nd.y + nd.h + 4 : nd.y) / H) * 100}%`, height: nd.below ? undefined : `${(nd.h / H) * 100}%` };
          const tight = !nd.below && nd.h < 50;
          const txt = nd.below ? "white" : onFill(nd.fill);
          return (
            <DrillLink
              key={nd.id}
              title={DRILL[nd.id].title}
              filters={DRILL[nd.id].filters}
              aria-label={`${nd.label}: ${nd.v}. Open in Master data`}
              className={cn(nd.below ? "absolute rounded-sm text-center" : cn("absolute grid text-center", tight ? "place-items-center" : "place-content-center"), "outline-none ring-white/0 transition-[box-shadow] hover:ring-2 hover:ring-white/60 focus-visible:ring-2 focus-visible:ring-white", nd.h === 0 && !nd.below && "pointer-events-none")}
              style={nd.below ? { ...style, top: `${(nd.y / H) * 100}%`, paddingTop: nd.h + 4 } : style}
            >
              {nd.h === 0 && !nd.below ? null : (
                <span className={tight ? "flex items-baseline justify-center gap-1.5" : "contents"}>
                  <span className="hidden text-xs sm:block" style={{ color: nd.below ? "var(--color-on-dark)" : txt }}>{nd.label}</span>
                  <span className="nums text-sm font-medium sm:text-lg" style={{ color: txt }}>{n(nd.v)}</span>
                </span>
              )}
            </DrillLink>
          );
        })}
      </div>
      <Legend
        className="mt-4 sm:hidden"
        items={nodes.map((nd) => ({ label: nd.label, fill: nd.fill, value: nd.v, drill: DRILL[nd.id] }))}
      />
      <p className="mt-2 text-xs text-on-dark">Blocks left of the offers count students; from the offers on they count offers. A student can hold several.</p>
      <Meetings data={data} className="mt-6 border-t border-white/15 pt-5" />
      <div className="mt-5 grid gap-x-10 gap-y-6 border-t border-white/15 pt-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
        <div className="min-w-0">
          <p className="mb-2 text-[13px] text-on-dark">Findtern band of the {n(inter)} interviewed</p>
          <BandBar data={data} />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[13px] text-on-dark">CGPA / % band of the {n(inter)} interviewed</p>
          <MarksBar data={data} />
        </div>
        <Averages data={data} className="md:col-span-2 xl:col-span-1" />
      </div>
    </DesignFrame>
  );
}
