"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";

import { SURFACE_CLASS } from "@/components/app/primitives";
import type { BoardItem, BoardKey, DriveBoard } from "@/lib/college/drive-board";
import { yearLabel } from "@/lib/college/labels";
import { cn } from "@/lib/utils";
import { NudgeButton } from "./nudge-button";

type Tile = { key: BoardKey; label: string; hint: (n: number) => string; nudge?: "meeting" | "offer" | "online"; critical?: boolean };

/** Needs the officer now, most urgent first (his order: calls, offers, offline). */
const CRITICAL: Tile[] = [
  { key: "meetingsWaiting", label: "Calls not answered", hint: (n) => (n ? "An employer asked; the student hasn't replied" : "Every call request is answered"), nudge: "meeting", critical: true },
  { key: "offersWaiting", label: "Offers not answered", hint: (n) => (n ? "Neither accepted nor declined yet" : "Every offer has a reply"), nudge: "offer", critical: true },
  { key: "offline", label: "Offline now", hint: (n) => (n ? "Not on Findtern during the drive" : "Everyone is online"), nudge: "online", critical: true },
];
/** What the drive has produced so far. */
const RESULTS: Tile[] = [
  { key: "offers", label: "Offers received", hint: () => "" },
  { key: "meetings", label: "Meetings scheduled", hint: (n) => (n ? "Calls students accepted" : "No call accepted yet") },
  { key: "internships", label: "Placed: internship", hint: (n) => (n ? "Hired for an internship" : "No hire yet") },
  { key: "fullTime", label: "Placed: full-time", hint: (n) => (n ? "Hired for a full-time role" : "No hire yet") },
];
/** Opened from the hero's pipeline; not tiles of their own. */
const STAGES: Tile[] = [
  { key: "called", label: "Called by an employer", hint: () => "" },
  { key: "hired", label: "Hired", hint: () => "" },
];
const ALL = [...CRITICAL, ...RESULTS, ...STAGES];
const PAGE = 40;

/**
 * The drive's dashboard: every figure is a button that opens its students below, where the officer nudges them
 * all at once or one by one. Opens on the most urgent list that has anyone in it.
 */
export function DriveBoardView({ board, live, open, initial }: { board: DriveBoard; live: boolean; open: boolean; initial?: string }) {
  const count = (k: BoardKey) => (k === "offers" ? board.offerCount : board.lists[k].length);
  const first = CRITICAL.find((t) => count(t.key) > 0 && (t.key !== "offline" || board.offlineKnown))?.key ?? "offers";
  const [sel, setSel] = useState<BoardKey>(ALL.find((t) => t.key === initial)?.key ?? first);
  const [all, setAll] = useState(false);
  const tile = ALL.find((t) => t.key === sel)!;
  const rows = board.lists[sel];
  const shown = all ? rows : rows.slice(0, PAGE);
  const canNudge = Boolean(tile.nudge) && open && (tile.key !== "offline" || live);

  const button = (t: Tile) => {
    const n = count(t.key);
    const unknown = t.key === "offline" && !board.offlineKnown;
    const on = sel === t.key;
    const students = board.lists[t.key].length;
    return (
      <button
        key={t.key}
        type="button"
        aria-pressed={on}
        disabled={unknown}
        onClick={() => {
          setSel(t.key);
          setAll(false);
        }}
        className={cn(
          "relative flex min-h-[7.5rem] flex-col justify-between gap-3 px-5 py-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 disabled:cursor-default",
          // The selected figure: a 2px brand line along its foot, the same mark on every tile.
          on ? "bg-ink-50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand-600" : "hover:bg-ink-50/60",
        )}
      >
        <span className="text-sm font-medium text-ink-700">{t.label}</span>
        <span>
          <span className={cn("nums block text-[2rem] font-light leading-none tracking-[-0.03em]", unknown || n === 0 ? "text-ink-400" : t.critical ? "text-accent-700" : "text-ink-900")}>
            {unknown ? "—" : n.toLocaleString("en-IN")}
          </span>
          <span className="mt-1.5 block text-xs text-text-subtle">
            {unknown ? "Shows while the drive is live" : t.key === "offers" ? (n ? `to ${students} ${students === 1 ? "student" : "students"}` : "No offer yet") : t.hint(n)}
          </span>
        </span>
      </button>
    );
  };

  return (
    <section id="board" aria-label="Drive dashboard" className={cn("scroll-mt-6 overflow-hidden", SURFACE_CLASS)}>
      <div className="border-b border-ink-100 px-5 pt-4 pb-1">
        <h2 className="text-base font-semibold text-ink-900">Needs you now</h2>
      </div>
      <div className="grid divide-y divide-ink-100 border-b border-ink-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">{CRITICAL.map(button)}</div>
      <div className="border-b border-ink-100 px-5 pt-4 pb-1">
        <h2 className="text-base font-semibold text-ink-900">What this drive has produced</h2>
      </div>
      <div className="grid grid-cols-2 divide-ink-100 border-b border-ink-100 max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(even)]:border-l sm:grid-cols-4 sm:divide-x">{RESULTS.map(button)}</div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h3 className="text-sm font-semibold text-ink-900">
          {tile.label} <span className="nums font-normal text-text-subtle">· {rows.length.toLocaleString("en-IN")} {rows.length === 1 ? "student" : "students"}</span>
        </h3>
        {canNudge && rows.length > 0 ? (
          <NudgeButton key={`${sel}-${rows.length}`} kind={tile.nudge!} userIds={rows.map((r) => r.userId)} label={`Nudge all ${rows.length}`} emphasis />
        ) : null}
      </div>
      {!open ? (
        <p className="border-t border-ink-100 px-5 py-6 text-sm text-text-subtle">The drive is over, so the student lists are closed. The figures above stay.</p>
      ) : rows.length === 0 ? (
        <p className="border-t border-ink-100 px-5 py-6 text-sm text-text-subtle">Nobody here right now.</p>
      ) : (
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {shown.map((r) => (
            <Row key={r.userId} r={r} nudge={canNudge ? tile.nudge : undefined} />
          ))}
        </ul>
      )}
      {open && rows.length > PAGE && !all ? (
        <div className="border-t border-ink-100 px-5 py-3">
          <button type="button" onClick={() => setAll(true)} className="min-h-9 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">
            Show all {rows.length.toLocaleString("en-IN")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Row({ r, nudge }: { r: BoardItem; nudge?: "meeting" | "offer" | "online" }) {
  const meta = [r.rollNo, r.year ? yearLabel(r.year) : null, r.branch].filter(Boolean).join(" · ");
  return (
    <li className="grid gap-x-6 gap-y-1.5 px-5 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0">
        <Link href={`/college/students/${r.userId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
          {r.name || "Student"}
        </Link>
        {meta ? <p className="truncate text-xs text-text-subtle">{meta}</p> : null}
      </div>
      <p className="min-w-0 text-sm text-ink-700">{r.detail}</p>
      {r.phone ? (
        <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="nums inline-flex items-center gap-1.5 text-sm text-ink-700 hover:text-brand-700">
          <Phone className="size-3.5 text-ink-400" aria-hidden />
          {r.phone}
        </a>
      ) : (
        <span className="text-sm text-ink-400">No phone</span>
      )}
      <span className="sm:justify-self-end">{nudge ? <NudgeButton kind={nudge} userIds={[r.userId]} label="Nudge" size="xs" /> : null}</span>
    </li>
  );
}
