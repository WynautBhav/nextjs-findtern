"use client";

import { cn } from "@/lib/utils";

/**
 * The journey as a metro line (Design 07). Each station is a ring: the centre is how many reached it, the amber arc
 * is the share still waiting there, and the dots above are the waiting people (one dot per `perDot`). Between
 * stations the line carries the conversion. A station may hang spur stops below it (people in a sub-state) and the
 * line may end in a branch (two terminals). Horizontal from md, vertical on a phone.
 */

export type Spur = { key: string; label: string; count: number; onOpen?: () => void };
export type Station = {
  key: string;
  label: string;
  reached: number;
  /** People still at this stop (not yet at the next). Omit on a terminal. */
  waiting?: number;
  /** A caption under the label; defaults to "N waiting". */
  caption?: string;
  onOpen?: () => void;
  spurs?: Spur[];
  /** Terminal branch after the last station (Internship / Full-time). */
  branch?: Spur[];
  tone?: "line" | "end";
};

const fmt = (n: number) => n.toLocaleString("en-IN");

function Ring({ s, small = false }: { s: Pick<Station, "label" | "reached" | "waiting" | "onOpen" | "tone">; small?: boolean }) {
  const share = s.reached > 0 && s.waiting ? Math.min(1, s.waiting / s.reached) : 0;
  const filled = s.tone === "end";
  return (
    <button
      type="button"
      onClick={s.onOpen}
      disabled={!s.onOpen}
      aria-label={`${s.label}: ${fmt(s.reached)}${s.waiting ? `, ${fmt(s.waiting)} waiting` : ""}. Open the list`}
      className={cn(
        "relative z-10 grid shrink-0 place-items-center rounded-full outline-none transition-transform duration-200 motion-safe:hover:scale-[1.06] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default",
        small ? "size-10" : "size-14",
      )}
      style={{
        background: filled
          ? "var(--color-brand-700)"
          : `conic-gradient(var(--color-accent-500) 0 ${share * 360}deg, var(--color-brand-700) ${share * 360}deg 360deg)`,
      }}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full font-semibold tabular-nums",
          small ? "size-7 text-xs" : "size-11 text-[0.9375rem]",
          filled ? "bg-brand-700 text-white" : "bg-[color:var(--admin-panel)] text-foreground",
        )}
      >
        {fmt(s.reached)}
      </span>
    </button>
  );
}

/** Waiting people as dots, growing upward from the ring so every ring stays on the line. */
function WaitDots({ waiting, perDot }: { waiting: number; perDot: number }) {
  const n = waiting > 0 ? Math.min(30, Math.ceil(waiting / perDot)) : 0;
  return (
    <span aria-hidden className="relative block h-3 w-24 max-md:hidden">
      <span className="absolute inset-x-0 bottom-0 flex flex-wrap-reverse justify-center gap-[3px]">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="size-[5px] rounded-full bg-accent-500" />
        ))}
      </span>
    </span>
  );
}

/** The line between two stations (from ring centre to ring centre, under the rings) and its conversion. */
function Segment({ from, to }: { from: Station; to: Station }) {
  const conv = from.reached > 0 ? Math.round((to.reached / from.reached) * 100) : null;
  const drop = from.reached - to.reached;
  return (
    <div className="relative min-h-10 md:h-[2.875rem] md:min-w-10 md:flex-1">
      <span
        aria-hidden
        className="absolute bg-brand-700 max-md:-bottom-2 max-md:-top-2 max-md:left-[1.5625rem] max-md:w-1.5 md:-left-14 md:-right-14 md:bottom-0 md:h-1.5 md:translate-y-1/2"
      />
      <span className="absolute whitespace-nowrap text-[0.6875rem] leading-none tabular-nums text-text-subtle max-md:left-12 max-md:top-1/2 max-md:-translate-y-1/2 md:bottom-3 md:left-1/2 md:-translate-x-1/2">
        {conv === null ? "—" : `${conv}%`}
        {drop > 0 ? ` · −${fmt(drop)}` : ""}
      </span>
    </div>
  );
}

function StationCell({ s, perDot, last }: { s: Station; perDot: number; last: boolean }) {
  const caption = s.caption ?? (s.waiting ? `${fmt(s.waiting)} waiting` : s.waiting === 0 ? "none waiting" : "");
  return (
    <div className="relative flex shrink-0 items-start gap-3 md:w-28 md:flex-col md:items-center md:gap-1.5">
      {/* phone: the line runs on down past a tall stop (its spurs) to the next segment */}
      {!last || s.branch?.length ? <span aria-hidden className="absolute bottom-0 left-[1.5625rem] top-7 w-1.5 bg-brand-700 md:hidden" /> : null}
      <WaitDots waiting={s.waiting ?? 0} perDot={perDot} />
      <Ring s={s} />
      <div className="min-w-0 pt-1.5 md:pt-0 md:text-center">
        <div className="text-sm font-medium leading-tight text-foreground">{s.label}</div>
        {caption ? <div className={cn("mt-0.5 text-xs tabular-nums", s.waiting ? "text-accent-700" : "text-text-subtle")}>{caption}</div> : null}
        {s.spurs?.length ? (
          <ul className="mt-2 flex flex-col gap-1 md:items-center">
            {s.spurs.map((sp) => (
              <li key={sp.key}>
                <button
                  type="button"
                  onClick={sp.onOpen}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-brand-300 px-2.5 py-1 text-xs text-foreground transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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

export function Metro({ stations, perDot = 10, className }: { stations: Station[]; perDot?: number; className?: string }) {
  const branch = stations[stations.length - 1]?.branch ?? [];
  return (
    <div className={cn("flex flex-col md:flex-row md:items-start", className)}>
      {stations.map((s, i) => (
        <div key={s.key} className="contents">
          {i > 0 ? <Segment from={stations[i - 1]} to={s} /> : null}
          <StationCell s={s} perDot={perDot} last={i === stations.length - 1} />
        </div>
      ))}
      {branch.length ? (
        <div className="relative flex flex-col gap-3 max-md:ml-[1.5625rem] max-md:mt-1 max-md:border-l-[6px] max-md:border-brand-700 max-md:pl-3 max-md:pt-2 md:-ml-6 md:mt-[0.5rem] md:pt-0">
          {branch.map((b, i) => (
            <div key={b.key} className="relative flex items-center gap-2.5 md:pl-10">
              {/* the branch arms: one up, one down from the hired ring's line */}
              <span
                aria-hidden
                className={cn("absolute left-0 hidden h-1.5 w-10 origin-left bg-brand-700 md:block", i === 0 ? "top-[calc(50%+0.9rem)] -rotate-[28deg]" : "top-[calc(50%-1.1rem)] rotate-[28deg]")}
              />
              <Ring s={{ label: b.label, reached: b.count, onOpen: b.onOpen, tone: "end" }} small />
              <span className="whitespace-nowrap text-sm text-foreground">{b.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
