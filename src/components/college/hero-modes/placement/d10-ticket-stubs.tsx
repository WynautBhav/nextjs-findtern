import type { CSSProperties } from "react";
import type { PlacementData } from "@/lib/college/overview-modes";
import { DesignFrame, GOLD, n, OUTCOME_FILL, pct, white } from "../kit";
import { INK, onFill, OUTCOMES, Scores } from "./parts";


/** A ticket: a flat fill with a V torn out of the top and the bottom edge where the stub begins, and a dashed tear line between. */
function Ticket({ fill, className, children }: { fill: string; className?: string; children: React.ReactNode }) {
  const x = (d: string) => `calc(var(--at) ${d})`;
  const style: CSSProperties = {
    background: fill,
    color: onFill(fill),
    gridTemplateColumns: "var(--at) minmax(0, 1fr)",
    // A V torn out of the top and bottom edge where the stub begins.
    clipPath: `polygon(0 0, ${x("- 9px")} 0, var(--at) 9px, ${x("+ 9px")} 0, 100% 0, 100% 100%, ${x("+ 9px")} 100%, var(--at) calc(100% - 9px), ${x("- 9px")} 100%, 0 100%)`,
  };
  return (
    <div className={`relative grid ${className ?? ""}`} style={style}>
      {children}
      <span aria-hidden className="absolute inset-y-3 w-0 border-l-2 border-dashed" style={{ left: "var(--at)", borderColor: `color-mix(in srgb, ${onFill(fill) === "white" ? "white" : INK} 35%, transparent)` }} />
    </div>
  );
}

/**
 * Placement 10, "Ticket stubs": every offer outcome is a torn ticket with its count on the stub; the share of all
 * offers is on the body. Internships and PPOs are boarding passes from the interview to the job, with the Findtern
 * band counts on the stub. Scores sit at the foot.
 */
export function TicketStubs({ data }: { data: PlacementData }) {
  const o = data.offers;
  const parts = OUTCOMES(o);
  const inter = data.interviewed;
  const passes = [
    { key: "hired", label: "Internship", to: data.internships, fill: GOLD, band: (b: PlacementData["coffee"][number]) => b.hired },
    { key: "ppo", label: "PPO, full-time offer", to: data.ppo, fill: white(0.72), band: (b: PlacementData["coffee"][number]) => b.ppo },
  ];
  return (
    <DesignFrame
      label="Offer outcomes as tickets, internships and PPOs as boarding passes"
      finding={
        <>
          {n(o.received)} offers were issued: {n(o.accepted)} accepted, {n(o.notAnswered)} still unanswered. {n(data.internships)} of {n(inter)} interviewed students are hired.
        </>
      }
    >
      <p className="text-[13px] text-on-dark-subtle">
        Offers received <span className="nums ml-1 text-lg font-light text-white">{n(o.received)}</span>
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {parts.map((p) => (
          <li key={p.key}>
            <Ticket fill={OUTCOME_FILL[p.key]} className="h-[5.5rem] [--at:60%]">
              <div className="flex min-w-0 flex-col justify-center py-3 pl-4 pr-3">
                <p className="text-sm leading-tight">{p.key === "withdrawn" ? "Withdrawn" : p.label}</p>
                <p className="nums mt-1 text-xs opacity-80">{pct(p.v, o.received)}%<span className="hidden sm:inline"> of offers</span></p>
              </div>
              <div className="grid place-items-center pr-1">
                <span className="nums text-[1.5rem] font-light leading-none tracking-[-0.02em] sm:text-[1.75rem]">{n(p.v)}</span>
              </div>
            </Ticket>
          </li>
        ))}
      </ul>
      <ul className="mt-3 grid gap-2.5 lg:grid-cols-2">
        {passes.map((ps) => (
          <li key={ps.key}>
            <Ticket fill={ps.fill} className="min-h-[7rem] [--at:52%] sm:[--at:64%]">
              <div className="flex min-w-0 flex-col justify-center gap-2 py-3.5 pl-4 pr-3">
                <p className="text-sm">{ps.label}</p>
                <div className="flex items-center gap-2.5" aria-label={`${n(inter)} interviewed, ${n(ps.to)} ${ps.label}`} role="img">
                  <span className="nums text-[1.5rem] font-light leading-none tracking-[-0.02em]">{n(inter)}</span>
                  <span aria-hidden className="h-0 min-w-6 flex-1 border-t-2 border-dashed" style={{ borderColor: `color-mix(in srgb, ${onFill(ps.fill) === "white" ? "white" : INK} 45%, transparent)` }} />
                  <svg aria-hidden viewBox="0 0 10 10" className="size-3 shrink-0 -ml-2"><path d="M1 1 L9 5 L1 9 Z" fill="currentColor" /></svg>
                  <span className="nums text-[1.5rem] font-light leading-none tracking-[-0.02em]">{n(ps.to)}</span>
                </div>
                <p className="text-xs opacity-80">Interviewed to {ps.key === "hired" ? "hired" : "PPO"}, {pct(ps.to, inter)}%</p>
              </div>
              <dl className="nums flex flex-col justify-center gap-0.5 py-3 pl-4 pr-3 text-xs">
                {data.coffee.map((b) => (
                  <div key={b.key} className="flex justify-between gap-2">
                    <dt className="opacity-80">{b.name}</dt>
                    <dd className="text-sm">{n(ps.band(b))}</dd>
                  </div>
                ))}
              </dl>
            </Ticket>
          </li>
        ))}
      </ul>
      <Scores data={data} className="mt-5" />
    </DesignFrame>
  );
}
