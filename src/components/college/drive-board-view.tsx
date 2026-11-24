"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";

import { SURFACE_CLASS } from "@/components/app/primitives";
import type { BoardItem, BoardKey, DriveBoard, NudgeHistoryKind } from "@/lib/college/drive-board";
import { yearLabel } from "@/lib/college/labels";
import { cn } from "@/lib/utils";
import { NudgeButton } from "./nudge-button";

type Tile = {
  key: BoardKey;
  label: string;
  hint: (n: number, b: DriveBoard) => string;
  /** The nudge this list sends. On a nudge-history list it goes only to the students who still need it (`again`). */
  nudge?: NudgeHistoryKind;
  critical?: boolean;
  /** Shown as "x of the drive's students". */
  ofTotal?: boolean;
  /** The figure when it is not the number of students in the list (offers and nudges are counted one by one). */
  figure?: (b: DriveBoard) => number;
  /** Known only while the drive is live (presence). */
  needsPresence?: boolean;
};
type Group = { title: string; tiles: Tile[] };

/** Under a nudge figure: how many different students it went to. */
const sentTo = (n: number) => (n ? `to ${n} ${n === 1 ? "student" : "students"}` : "None sent");
const NUDGES: Tile[] = [
  { key: "nudgedOnline", label: "Asked to come online", nudge: "online", figure: (b) => b.nudgeCounts.nudgedOnline, hint: sentTo },
  { key: "nudgedOpenToWork", label: "Asked to turn on Open to work", nudge: "open_to_work", figure: (b) => b.nudgeCounts.nudgedOpenToWork, hint: sentTo },
  { key: "nudgedMeet", label: "Reminded about a meet", nudge: "meeting", figure: (b) => b.nudgeCounts.nudgedMeet, hint: sentTo },
  { key: "nudgedOffer", label: "Reminded about an offer", nudge: "offer", figure: (b) => b.nudgeCounts.nudgedOffer, hint: sentTo },
];
const ALL_STUDENTS: Tile = { key: "all", label: "Total students", hint: () => "Verified, in the drive" };
/** Under a meeting figure: how many different students it covers. */
const ofStudents = (n: number, none: string) => (n ? `${n} ${n === 1 ? "student" : "students"}` : none);
/** Meet requests from employers, counted one by one; each opens its students. Live and past alike. */
const MEETINGS: Group = {
  title: "Meetings",
  tiles: [
    { key: "called", label: "Meets sent", figure: (b) => b.meetCounts.sent, hint: (n) => ofStudents(n, "No meet request yet") },
    { key: "meetings", label: "Meets accepted", figure: (b) => b.meetCounts.accepted, hint: (n) => ofStudents(n, "None accepted") },
    { key: "meetCompleted", label: "Meets completed", figure: (b) => b.meetCounts.completed, hint: (n) => (n ? `${ofStudents(n, "")} · accepted, time over` : "None yet") },
    { key: "meetExpired", label: "Meets expired", figure: (b) => b.meetCounts.expired, hint: (n) => (n ? `${ofStudents(n, "")} · no reply in time` : "None expired") },
  ],
};
const OFFER_COUNTS = (b: DriveBoard) => `${b.offerCount} ${b.offerCount === 1 ? "offer" : "offers"} · ${b.offerSplit.internship} internship · ${b.offerSplit.fullTime} full-time / PPO`;

/** While the drive runs: what needs the officer now (his order: calls, offers, offline, then Open to work), who is here, what it produced. */
const LIVE: Group[] = [
  {
    title: "Needs you now",
    tiles: [
      { key: "meetingsWaiting", label: "Drive meets not answered", hint: (n) => (n ? "An employer asked; the student hasn't replied" : "Every meet request is answered"), nudge: "meeting", critical: true },
      { key: "offersWaiting", label: "Offers not answered", hint: (n) => (n ? "Neither accepted nor declined yet" : "Every offer has a reply"), nudge: "offer", critical: true },
      { key: "offline", label: "Offline now", hint: (n) => (n ? "Not on Findtern during the drive" : "Everyone is online"), nudge: "online", critical: true, ofTotal: true, needsPresence: true },
      { key: "notOpen", label: "Not open to work", hint: (n) => (n ? "Employers can't find them" : "Everyone is open to work"), nudge: "open_to_work", critical: true, ofTotal: true },
    ],
  },
  { title: "Students in the drive", tiles: [ALL_STUDENTS, { key: "online", label: "Online now", hint: (n) => (n ? "On Findtern right now" : "Nobody is online"), ofTotal: true, needsPresence: true }] },
  MEETINGS,
  {
    title: "What this drive has produced",
    tiles: [
      { key: "offers", label: "Offers received", figure: (b) => b.offerCount, hint: (n, b) => (b.offerCount ? `to ${n} ${n === 1 ? "student" : "students"}` : "No offer yet") },
      { key: "internships", label: "Placed: internship", hint: (n) => (n ? "Hired for an internship" : "No hire yet") },
      { key: "fullTime", label: "Placed: full-time", hint: (n) => (n ? "Hired for a full-time role" : "No hire yet") },
    ],
  },
  { title: "Nudges sent", tiles: NUDGES },
];
/** Once it is over: read-only. Who got what, who placed, and the nudges that were sent. */
const PAST: Group[] = [
  {
    title: "Offers",
    tiles: [
      ALL_STUDENTS,
      { key: "offers", label: "Got an offer", hint: (n, b) => (n ? OFFER_COUNTS(b) : "No offer was made") },
      { key: "declinedAll", label: "Didn't accept any offer", hint: (n) => (n ? "Had offers and said no to each" : "Nobody turned every offer down") },
      { key: "unanswered", label: "Didn't answer any offer", hint: (n) => (n ? "Had offers and never replied" : "Everyone replied to something") },
    ],
  },
  {
    title: "Placed",
    tiles: [
      { key: "hired", label: "Hired", hint: (n) => (n ? "Hired by a company" : "No hire") },
      { key: "internships", label: "Internship", hint: (n) => (n ? "Hired for an internship" : "No internship hire") },
      { key: "fullTime", label: "Full-time / PPO", hint: (n) => (n ? "Hired for a full-time or PPO role" : "No full-time hire") },
    ],
  },
  MEETINGS,
  { title: "Nudges sent", tiles: NUDGES },
];
/** Opened from the hero's pipeline; not tiles of their own. */
const STAGES: Tile[] = [
  { key: "hired", label: "Hired", hint: () => "" },
];
/**
 * A live drive's "still waiting" lists, asked for on a past one (the summary's links): what they became once it ended.
 * Without this the board fell back to Offers (owner brief, 24 Nov: "clicking meetings jumps to Offers").
 */
const PAST_ALIAS: Partial<Record<BoardKey, BoardKey>> = { meetingsWaiting: "meetExpired", offersWaiting: "unanswered", offline: "all", online: "all", notOpen: "all" };
const PAGE = 40;
const GRID = {
  2: "grid grid-cols-2 divide-x divide-ink-100 border-b border-ink-100",
  3: "grid grid-cols-3 divide-x divide-ink-100 border-b border-ink-100",
  4: "grid grid-cols-2 divide-ink-100 border-b border-ink-100 max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(even)]:border-l sm:grid-cols-4 sm:divide-x",
} as const;

/**
 * The drive's dashboard: every figure is a button that opens its students below. While the drive runs the officer
 * nudges them all at once or one by one (`open`); once it is over the same lists are read-only.
 * `filter`: the board of one company's students (Students for Acme), with a link back to the whole drive.
 */
export function DriveBoardView({ board, open, initial, filter }: { board: DriveBoard; open: boolean; initial?: string; filter?: { company: string; clearHref: string } | null }) {
  const groups = open ? LIVE : PAST;
  const all = [...groups.flatMap((g) => g.tiles), ...STAGES];
  const total = board.lists.all.length;
  const figure = (t: Tile) => (t.figure ? t.figure(board) : board.lists[t.key].length);
  const unknown = (t: Tile) => Boolean(t.needsPresence) && !board.offlineKnown;
  const need = LIVE[0].tiles.find((t) => board.lists[t.key].length > 0 && !unknown(t));
  const first = open ? (need?.key ?? "offers") : "offers";
  const asked = (!open && initial ? (PAST_ALIAS[initial as BoardKey] ?? initial) : initial) as BoardKey | undefined;
  const [sel, setSel] = useState<BoardKey>(all.find((t) => t.key === asked)?.key ?? first);
  const [showAll, setShowAll] = useState(false);
  const tile = all.find((t) => t.key === sel)!;
  const rows = board.lists[sel];
  const shown = showAll ? rows : rows.slice(0, PAGE);
  // Nudging is for a running drive only. On a nudge-history list it goes to who still needs it, not to everyone once nudged.
  const canNudge = Boolean(tile.nudge) && open;
  const nudgeIds = (tile.key.startsWith("nudged") ? rows.filter((r) => r.again) : rows).map((r) => r.userId);

  const button = (t: Tile) => {
    const n = figure(t);
    const off = unknown(t);
    const on = sel === t.key;
    return (
      <button
        key={t.key}
        type="button"
        aria-pressed={on}
        disabled={off}
        onClick={() => {
          setSel(t.key);
          setShowAll(false);
        }}
        className={cn(
          "relative flex min-h-[7.5rem] flex-col justify-between gap-3 px-5 py-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 disabled:cursor-default",
          // The selected figure: a 2px brand line along its foot, the same mark on every tile.
          on ? "bg-ink-50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand-600" : "hover:bg-ink-50/60",
        )}
      >
        <span className="text-sm font-medium text-ink-700">{t.label}</span>
        <span>
          <span className={cn("nums block text-[2rem] font-light leading-none tracking-[-0.03em]", off || n === 0 ? "text-ink-400" : t.critical ? "text-accent-700" : "text-ink-900")}>
            {off ? "—" : n.toLocaleString("en-IN")}
            {t.ofTotal && !off ? <span className="ml-1.5 text-sm font-normal tracking-normal text-text-subtle">of {total.toLocaleString("en-IN")}</span> : null}
          </span>
          <span className="mt-1.5 block text-xs text-text-subtle">{off ? "Shows while the drive is live" : t.hint(board.lists[t.key].length, board)}</span>
        </span>
      </button>
    );
  };

  return (
    <section id="board" aria-label="Drive dashboard" className={cn("scroll-mt-6 overflow-hidden", SURFACE_CLASS)}>
      {filter ? (
        <p className="flex flex-wrap items-center gap-x-2 border-b border-ink-100 bg-ink-50 px-5 py-3 text-sm text-ink-700">
          <span>
            Students for <span className="font-medium text-ink-900">{filter.company}</span>
          </span>
          <span aria-hidden>·</span>
          <Link href={filter.clearHref} className="font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">
            Clear filter
          </Link>
        </p>
      ) : null}
      {groups.map((g) => (
        <TileGroup key={g.title} title={g.title}>
          <div className={g.tiles.length === 2 ? GRID[2] : g.tiles.length === 3 ? GRID[3] : GRID[4]}>{g.tiles.map(button)}</div>
        </TileGroup>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h3 className="text-sm font-semibold text-ink-900">
          {tile.label} <span className="nums font-normal text-text-subtle">· {rows.length.toLocaleString("en-IN")} {rows.length === 1 ? "student" : "students"}</span>
        </h3>
        {canNudge && nudgeIds.length > 0 ? (
          <NudgeButton key={`${sel}-${nudgeIds.length}`} kind={tile.nudge!} userIds={nudgeIds} label={tile.key.startsWith("nudged") ? `Nudge again ${nudgeIds.length}` : `Nudge all ${nudgeIds.length}`} emphasis />
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-ink-100 px-5 py-6 text-sm text-text-subtle">{open ? "Nobody here right now." : "Nobody here."}</p>
      ) : (
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {shown.map((r) => (
            <Row key={r.userId} r={r} nudge={canNudge && r.again !== false ? tile.nudge : undefined} />
          ))}
        </ul>
      )}
      {rows.length > PAGE && !showAll ? (
        <div className="border-t border-ink-100 px-5 py-3">
          <button type="button" onClick={() => setShowAll(true)} className="min-h-9 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">
            Show all {rows.length.toLocaleString("en-IN")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** A titled row of tiles. */
function TileGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="border-b border-ink-100 px-5 pt-4 pb-1">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
      </div>
      {children}
    </>
  );
}

/** One student in a list: name and roll line, what happened, phone. Shared with the past-drive pop-ups. */
export function Row({ r, nudge }: { r: BoardItem; nudge?: NudgeHistoryKind }) {
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
