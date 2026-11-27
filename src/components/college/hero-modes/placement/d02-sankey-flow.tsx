import type { PlacementData } from "@/lib/college/overview-modes";
import { DesignFrame, GOLD, Legend, n, OUTCOME_FILL, white } from "../kit";
import { cn } from "@/lib/utils";
import { Averages, BandBar, goldA, MarksBar, Meetings, onFill } from "./parts";
import { DrillLink, type DrillFilters } from "../drill";
import { fitColumn, MIN_NODE } from "./sankey-fit";

const W = 1000;
const H = 230;
const NW = 130;
const STEP = (W - NW) / 4;
const PAD = 5;
const GAP = 10;
const per = (total: number, avail: number) => (total ? avail / total : 0);

type Node = { id: string; label: string; short?: string; v: number; x: number; y: number; h: number; fill: string };

/** What each block opens: the students behind it. Offer blocks count offers; the pop-up lists the students holding one. */
const DRILL: Record<string, { title: string; filters: DrillFilters }> = {
  i: { title: "Interviewed students", filters: { band: "done" } },
  o: { title: "Students who got an offer", filters: { placement: "offer" } },
  n: { title: "Interviewed, no offer yet", filters: { outcome: "no-offer" } },
  accepted: { title: "Students who accepted an offer", filters: { outcome: "accepted" } },
  notAnswered: { title: "Students with an offer not answered", filters: { outcome: "open" } },
  rejected: { title: "Students who rejected an offer", filters: { outcome: "rejected" } },
  withdrawn: { title: "Students with an offer withdrawn", filters: { outcome: "withdrawn" } },
  h: { title: "Students hired on an internship", filters: { outcome: "internship" } },
  d: { title: "Students who accepted a direct PPO", filters: { outcome: "ppo-direct" } },
  p: { title: "Students who accepted a PPO after the internship", filters: { outcome: "ppo-after" } },
};

function ribbon(x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) {
  const m = (x0 + x1) / 2;
  return `M${x0},${y0} C${m},${y0} ${m},${y1} ${x1},${y1} L${x1},${y1 + h1} C${m},${y1 + h1} ${m},${y0 + h0} ${x0},${y0 + h0} Z`;
}

/**
 * Placement 2, "Sankey flow": students flow left to right: interviewed, then split into got an offer and no offer; the
 * offers they hold (a student can hold several) split by what happened to each; accepted offers split into internships
 * and direct PPOs (a full-time offer with no internship first), and internships lead on to PPOs after the internship. Student stages share one scale and offer stages another, joined where the offer node widens into its
 * four outcomes. Bands and scores sit under the flow.
 */
export function SankeyFlow({ data }: { data: PlacementData }) {
  const o = data.offers;
  const inter = data.interviewed;
  const offerS = Math.min(data.withOffer, inter);
  const noOfferS = inter - offerS;
  const s0 = per(inter, H - 2 * PAD);
  const col1 = fitColumn([offerS, noOfferS], H - 2 * PAD - GAP);
  const col2 = fitColumn([o.accepted, o.notAnswered, o.rejected, o.withdrawn], H - 2 * PAD - 3 * GAP);

  const X = (i: number) => i * STEP;
  const interviewed: Node = { id: "i", label: "Interviewed", v: inter, x: X(0), y: PAD, h: inter * s0, fill: white(0.72) };
  const offer: Node = { id: "o", label: "Got an offer", v: offerS, x: X(1), y: PAD, h: col1.heights[0], fill: white(0.38) };
  const none: Node = { id: "n", label: "No offer", v: noOfferS, x: X(1), y: PAD + offer.h + GAP, h: col1.heights[1], fill: white(0.16) };
  let cy = PAD;
  const outs: Node[] = (
    [
      ["accepted", "Accepted", o.accepted],
      ["notAnswered", "Not answered", o.notAnswered],
      ["rejected", "Rejected", o.rejected],
      ["withdrawn", "Withdrawn", o.withdrawn],
    ] as const
  ).map(([k, label, v], i) => {
    const nd: Node = { id: k, label, v, x: X(2), y: cy, h: col2.heights[i], fill: OUTCOME_FILL[k] };
    cy += nd.h + GAP;
    return nd;
  });
  const acc = outs[0];
  const hiredS = data.internships;
  // Internships and PPOs keep the Accepted node's scale, so a raised small node never shrinks them.
  const perOffer = o.accepted ? acc.h / o.accepted : col2.scale;
  // The end blocks are always drawn, a 0 too, at least tall enough for their label (owner, 27 Nov).
  const endH = (v: number) => Math.max(MIN_NODE, v * perOffer);
  const intern: Node = { id: "h", label: "Internship", v: hiredS, x: X(3), y: acc.y, h: endH(hiredS), fill: GOLD };
  const direct: Node = { id: "d", label: "Direct PPO", v: data.ppoDirect, x: X(3), y: intern.y + intern.h + GAP, h: endH(data.ppoDirect), fill: GOLD };
  const ppo: Node = { id: "p", label: "PPO after internship", v: data.ppoAfter, x: X(4), y: intern.y, h: endH(data.ppoAfter), fill: GOLD };
  const nodes = [interviewed, offer, none, ...outs, intern, direct, ppo];
  // A tall internship block pushes Direct PPO down: the chart grows rather than clip it.
  const height = Math.max(H, direct.y + direct.h + PAD);

  // Ribbons.
  const ribbons: { d: string; fill: string }[] = [];
  ribbons.push({ d: ribbon(interviewed.x + NW, interviewed.y, offerS * s0, offer.x, offer.y, offer.h), fill: white(0.14) });
  ribbons.push({ d: ribbon(interviewed.x + NW, interviewed.y + (offerS * s0), noOfferS * s0, none.x, none.y, none.h), fill: white(0.06) });
  let sy = offer.y;
  for (const t of outs) {
    const sh = o.received ? (offer.h * t.v) / o.received : 0;
    ribbons.push({ d: ribbon(offer.x + NW, sy, sh, t.x, t.y, t.h), fill: t.id === "accepted" ? goldA(0.3) : white(0.08) });
    sy += sh;
  }
  const hSrc = Math.min(hiredS, o.accepted) * perOffer;
  if (hiredS) ribbons.push({ d: ribbon(acc.x + NW, acc.y, hSrc, intern.x, intern.y, intern.h), fill: goldA(0.3) });
  const dSrc = Math.min(data.ppoDirect, Math.max(0, o.accepted - Math.min(hiredS, o.accepted))) * perOffer;
  if (dSrc) ribbons.push({ d: ribbon(acc.x + NW, acc.y + hSrc, dSrc, direct.x, direct.y, direct.h), fill: goldA(0.3) });
  const pSrc = Math.min(data.ppoAfter, hiredS) * perOffer;
  if (pSrc) ribbons.push({ d: ribbon(intern.x + NW, intern.y, pSrc, ppo.x, ppo.y, ppo.h), fill: goldA(0.3) });

  return (
    <DesignFrame
      label="Flow from AI interview to offers, internships and PPOs"
      finding={
        <>
          {n(data.withOffer)} of {n(inter)} interviewed students got an offer; {n(o.accepted)} of their {n(o.received)} offers were accepted: {n(data.internships)} internships and {n(data.ppoDirect)} direct PPOs, and {n(data.ppoAfter)} {data.ppoAfter === 1 ? "intern" : "interns"} got a PPO after the internship.
        </>
      }
    >
      <div className="relative" style={{ height }}>
        <svg aria-hidden viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
          {ribbons.map((r, i) => (r.d ? <path key={i} d={r.d} fill={r.fill} /> : null))}
          {nodes.map((nd) => (
            <rect key={nd.id} x={nd.x} y={nd.y} width={NW} height={nd.h} fill={nd.fill} />
          ))}
        </svg>
        {nodes.map((nd) => {
          const style = { left: `${(nd.x / W) * 100}%`, width: `${(NW / W) * 100}%`, top: `${(nd.y / height) * 100}%`, height: `${(nd.h / height) * 100}%` };
          const tight = nd.h < 50;
          const txt = onFill(nd.fill);
          return (
            <DrillLink
              key={nd.id}
              title={DRILL[nd.id].title}
              filters={DRILL[nd.id].filters}
              aria-label={`${nd.label}: ${nd.v}. Open in Master data`}
              className={cn("absolute grid text-center", tight ? "place-items-center" : "place-content-center", "outline-none ring-white/0 transition-[box-shadow] hover:ring-2 hover:ring-white/60 focus-visible:ring-2 focus-visible:ring-white", nd.h === 0 && "pointer-events-none")}
              style={style}
            >
              {nd.h === 0 ? null : (
                <span className={tight ? "flex items-baseline justify-center gap-1.5" : "contents"}>
                  <span className={cn("hidden text-xs sm:block", tight && "leading-none")} style={{ color: txt }}>{nd.label}</span>
                  <span className={cn("nums font-medium", tight ? "text-sm leading-none" : "text-sm sm:text-lg")} style={{ color: txt }}>{n(nd.v)}</span>
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
