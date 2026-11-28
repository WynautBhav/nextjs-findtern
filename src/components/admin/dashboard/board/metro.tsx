"use client";

import { cn } from "@/lib/utils";

import { CountUp, FacePile, type Face } from "./visuals";

/**
 * The journey as a metro line (Design 07). Each station is a ring: the centre is how many reached it, the amber arc
 * is the share still waiting there, and the faces under it are who is waiting. People flow along the line between
 * stations (more dots where more of them get through). A station may hang spur stops below it, and the line may end
 * in a branch. `tone="night"` draws it on the deep green panel. Horizontal from md, vertical on a phone.
 */

export type Spur = { key: string; label: string; count: number; onOpen?: () => void };
export type Station = {
  key: string;
  label: string;
  reached: number;
  /** People still at this stop (not yet at the next). Omit on a terminal. */
  waiting?: number;
  /** Who is waiting, for the face pile (a few are enough; `waiting` is the count). */
  faces?: Face[];
  onOpenWaiting?: () => void;
  caption?: string;
  onOpen?: () => void;
  spurs?: Spur[];
  branch?: Spur[];
  tone?: "line" | "end";
};

type Theme = "day" | "night";
const fmt = (n: number) => n.toLocaleString("en-IN");

const T = {
  day: {
    line: "var(--color-brand-700)",
    arc: "var(--color-accent-500)",
    disc: "var(--admin-panel)",
    discInk: "var(--foreground)",
    endFill: "var(--color-brand-700)",
    endInk: "#fff",
    label: "text-foreground",
    sub: "text-text-subtle",
    wait: "text-accent-700",
    rate: "text-text-subtle",
    flow: "var(--color-brand-300)",
    spur: "border-brand-300 text-foreground hover:border-brand-500 hover:bg-brand-50",
    ring: "var(--admin-panel)",
  },
  night: {
    line: "var(--color-brand-500)",
    arc: "var(--color-accent-400)",
    disc: "#062a20",
    discInk: "#f2faf6",
    endFill: "var(--color-accent-400)",
    endInk: "#2a1a04",
    label: "text-[#f2faf6]",
    sub: "text-[#a9cbbd]",
    wait: "text-accent-300",
    rate: "text-[#a9cbbd]",
    flow: "#d9f2e6",
    spur: "border-[#3f7f69] text-[#e3f3eb] hover:border-[#8cbaa9] hover:bg-white/5",
    ring: "#0a3a2c",
  },
} as const;

function Ring({ s, theme, small = false }: { s: Pick<Station, "label" | "reached" | "waiting" | "onOpen" | "tone">; theme: Theme; small?: boolean }) {
  const t = T[theme];
  const share = s.reached > 0 && s.waiting ? Math.min(1, s.waiting / s.reached) : 0;
  const end = s.tone === "end";
  return (
    <button
      type="button"
      onClick={s.onOpen}
      disabled={!s.onOpen}
      aria-label={`${s.label}: ${fmt(s.reached)}${s.waiting ? `, ${fmt(s.waiting)} waiting` : ""}. Open the list`}
      className={cn(
        "relative z-10 grid shrink-0 place-items-center rounded-full outline-none transition-transform duration-300 ease-out motion-safe:hover:scale-[1.08] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default",
        small ? "size-11" : end ? "size-[4.5rem]" : "size-16",
      )}
      style={{ background: end ? t.endFill : `conic-gradient(${t.arc} 0 ${share * 360}deg, ${t.line} ${share * 360}deg 360deg)` }}
    >
      <span
        className={cn("grid place-items-center rounded-full font-semibold", small ? "size-8 text-xs" : end ? "size-[3.75rem] text-xl" : "size-[3.25rem] text-base")}
        style={{ background: end ? t.endFill : t.disc, color: end ? t.endInk : t.discInk }}
      >
        <CountUp value={s.reached} />
      </span>
    </button>
  );
}

/** The line between two stations (ring centre to ring centre, under the rings), people flowing along it, the rate. */
function Segment({ from, to, theme }: { from: Station; to: Station; theme: Theme }) {
  const t = T[theme];
  const conv = from.reached > 0 ? Math.round((to.reached / from.reached) * 100) : null;
  const drop = from.reached - to.reached;
  // More travellers where more people get through; none on a dead segment.
  const flow = to.reached === 0 ? 0 : Math.max(1, Math.min(4, Math.round(((conv ?? 0) / 100) * 4)));
  return (
    <div className="relative min-h-12 md:h-8 md:min-w-12 md:flex-1">
      <span
        aria-hidden
        className="absolute max-md:-bottom-2 max-md:-top-2 max-md:left-[1.75rem] max-md:w-2 max-md:-translate-x-1/2 md:-left-14 md:-right-14 md:bottom-0 md:h-2 md:translate-y-1/2 rounded-full"
        style={{ background: t.line }}
      >
        {Array.from({ length: flow }, (_, i) => (
          <span
            key={i}
            className="board-flow absolute size-2 rounded-full max-md:left-0 md:top-0"
            style={{ background: t.flow, animation: `var(--board-flow-anim) ${3.2}s linear ${(i * 3.2) / flow}s infinite` }}
          />
        ))}
      </span>
      <span className={cn("absolute whitespace-nowrap text-xs font-medium leading-none tabular-nums max-md:left-14 max-md:top-1/2 max-md:-translate-y-1/2 md:bottom-4 md:left-1/2 md:-translate-x-1/2", t.rate)}>
        {conv === null ? "—" : `${conv}%`}
        {drop > 0 ? <span className="font-normal opacity-80 md:hidden"> · {fmt(drop)} stopped</span> : null}
      </span>
      {drop > 0 ? (
        <span className={cn("absolute left-1/2 top-[calc(100%+0.75rem)] hidden -translate-x-1/2 whitespace-nowrap text-[0.6875rem] leading-none tabular-nums opacity-80 md:block", t.rate)}>
          {fmt(drop)} stopped
        </span>
      ) : null}
    </div>
  );
}

function StationCell({ s, theme, last }: { s: Station; theme: Theme; last: boolean }) {
  const t = T[theme];
  const caption = s.caption ?? (s.waiting ? `${fmt(s.waiting)} waiting` : s.waiting === 0 ? "none waiting" : "");
  return (
    <div className="relative flex shrink-0 items-start gap-3 md:w-32 md:flex-col md:items-center md:gap-2">
      {!last || s.branch?.length ? <span aria-hidden className="absolute bottom-0 left-[1.75rem] top-8 w-2 -translate-x-1/2 rounded-full md:hidden" style={{ background: t.line }} /> : null}
      <Ring s={s} theme={theme} />
      <div className="min-w-0 pt-1.5 md:pt-0 md:text-center">
        <div className={cn("text-sm font-medium leading-tight", t.label)}>{s.label}</div>
        {caption ? <div className={cn("mt-0.5 text-xs tabular-nums", s.waiting ? t.wait : t.sub)}>{caption}</div> : null}
        {s.faces?.length && s.waiting ? (
          <div className="mt-2 flex md:justify-center">
            <FacePile faces={s.faces} total={s.waiting} max={4} size="sm" ring={t.ring} onOpen={s.onOpenWaiting} label={`See the ${fmt(s.waiting)} waiting at ${s.label}`} />
          </div>
        ) : null}
        {s.spurs?.length ? (
          <ul className="mt-2 flex flex-col gap-1 md:items-center">
            {s.spurs.map((sp) => (
              <li key={sp.key}>
                <button
                  type="button"
                  onClick={sp.onOpen}
                  className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", t.spur)}
                >
                  {sp.label}
                  <span className="font-semibold tabular-nums">{fmt(sp.count)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function Metro({ stations, theme = "day", className }: { stations: Station[]; theme?: Theme; className?: string }) {
  const t = T[theme];
  const branch = stations[stations.length - 1]?.branch ?? [];
  return (
    <div className={cn("flex flex-col [--board-flow-anim:board-flow-y] md:flex-row md:items-start md:[--board-flow-anim:board-flow-x]", className)}>
      {stations.map((s, i) => (
        <div key={s.key} className="contents">
          {i > 0 ? <Segment from={stations[i - 1]} to={s} theme={theme} /> : null}
          <StationCell s={s} theme={theme} last={i === stations.length - 1} />
        </div>
      ))}
      {branch.length ? (
        <div className="relative flex flex-col gap-3 max-md:ml-[1.5rem] max-md:mt-1 max-md:border-l-8 max-md:pl-3 max-md:pt-2 md:-ml-7 md:mt-1" style={{ borderColor: t.line }}>
          {branch.map((b, i) => (
            <div key={b.key} className="relative flex items-center gap-2.5 md:pl-11">
              <span
                aria-hidden
                className={cn("absolute left-0 hidden h-2 w-12 origin-left rounded-full md:block", i === 0 ? "top-[calc(50%+1rem)] -rotate-[28deg]" : "top-[calc(50%-1.25rem)] rotate-[28deg]")}
                style={{ background: t.line }}
              />
              <Ring s={{ label: b.label, reached: b.count, onOpen: b.onOpen, tone: "line" }} theme={theme} small />
              <span className={cn("whitespace-nowrap text-sm", t.label)}>{b.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
