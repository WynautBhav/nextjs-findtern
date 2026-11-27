"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Phone, Search } from "lucide-react";

import { SURFACE_CLASS } from "@/components/app/primitives";
import type { BoardItem, BoardKey, DriveBoard, NudgeHistoryKind } from "@/lib/college/drive-board";
import { MEET_STAGE_LABEL } from "@/lib/college/meet-outcome";
import { yearLabel } from "@/lib/college/labels";
import { matches } from "@/lib/college/pop-table";
import { cn } from "@/lib/utils";
import { NudgeButton } from "./nudge-button";

type Tile = {
  key: BoardKey;
  label: string;
  hint: (n: number, b: DriveBoard) => string;
  /** The nudge this list sends. On a nudge-history list it goes only to the students who still need it (`again`). */
  nudge?: NudgeHistoryKind | "interview";
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
/**
 * Owner, 27 Nov: Total, Sent (waiting on the student: nudge), Accepted, Completed, Expired, Withdrawn, for meetings and
 * offers alike. Every meeting and offer is in exactly one stage (meet-outcome.ts, drive-board.ts offerStage), so the
 * stages add up to the total, and the summary and the dashboard read the same stages.
 */
const stageHint = (hint: string) => (n: number) => (n ? `${ofStudents(n, "")} · ${hint}` : "None");
const MEETINGS: Group = {
  title: "Meetings",
  tiles: [
    { key: "called", label: "Total meetings", figure: (b) => b.meetCounts.total, hint: (n) => ofStudents(n, "No meeting asked for yet") },
    { key: "meetingsWaiting", label: MEET_STAGE_LABEL.sent, figure: (b) => b.meetCounts.sent, hint: stageHint("waiting for the student's reply"), nudge: "meeting" },
    { key: "meetBooked", label: MEET_STAGE_LABEL.accepted, figure: (b) => b.meetCounts.accepted, hint: stageHint("time still ahead") },
    { key: "meetCompleted", label: MEET_STAGE_LABEL.completed, figure: (b) => b.meetCounts.completed, hint: stageHint("the company and the student met") },
    { key: "meetExpired", label: MEET_STAGE_LABEL.expired, figure: (b) => b.meetCounts.expired, hint: stageHint("not accepted, not joined or time over") },
    { key: "meetWithdrawn", label: MEET_STAGE_LABEL.withdrawn, figure: (b) => b.meetCounts.withdrawn, hint: stageHint("called off") },
  ],
};
const OFFER_COUNTS = (b: DriveBoard) => `${b.offerCount} ${b.offerCount === 1 ? "offer" : "offers"} · ${b.offerSplit.internship} internship · ${b.offerSplit.fullTime} full-time / PPO`;

const OFFERS: Group = {
    // Owner, 27 Nov: offers read like meetings (Total, Sent, Accepted, Rejected, Expired, Withdrawn: they add up to the
    // total), and the hires split by kind. Offers counted one by one (drive-board.ts offerStage).
    title: "Offers",
    tiles: [
      { key: "offersSent", label: "Total offers", figure: (b) => b.offerCounts.total, hint: (n) => ofStudents(n, "No offer yet") },
      { key: "offersWaiting", label: "Sent", figure: (b) => b.offerCounts.sent, hint: stageHint("waiting for the student's reply"), nudge: "offer" },
      { key: "offersAccepted", label: "Accepted", figure: (b) => b.offerCounts.accepted, hint: (n) => ofStudents(n, "None accepted") },
      { key: "offersRejected", label: "Rejected", figure: (b) => b.offerCounts.rejected, hint: (n) => ofStudents(n, "None rejected") },
      { key: "offersExpired", label: "Expired", figure: (b) => b.offerCounts.expired, hint: stageHint("no reply or not paid before the start day") },
      { key: "offersWithdrawn", label: "Withdrawn", figure: (b) => b.offerCounts.withdrawn, hint: (n) => (n ? `${ofStudents(n, "")} · taken back by the company` : "None withdrawn") },
      { key: "internships", label: "Hired: internship", figure: (b) => b.offerCounts.hiredInternship, hint: (n) => ofStudents(n, "No hire yet") },
      { key: "fullTime", label: "Hired: full-time", figure: (b) => b.offerCounts.hiredFullTime, hint: (n) => ofStudents(n, "No hire yet") },
    ],
  };

/** While the drive runs: what needs the officer now (his order: calls, offers, offline, then Open to work), who is here, what it produced. */
const LIVE: Group[] = [
  {
    title: "Needs you now",
    tiles: [
      { key: "meetingsWaiting", label: "Meetings sent, no reply", figure: (b) => b.meetCounts.sent, hint: (n) => (n ? ofStudents(n, "") : "Every meeting is answered"), nudge: "meeting", critical: true },
      { key: "offersWaiting", label: "Offers sent, no reply", figure: (b) => b.offerCounts.sent, hint: (n) => (n ? ofStudents(n, "") : "Every offer has a reply"), nudge: "offer", critical: true },
      { key: "offline", label: "Offline now", hint: (n) => (n ? "Each shows when last seen" : "Everyone is online"), nudge: "online", critical: true, ofTotal: true, needsPresence: true },
      { key: "notOpen", label: "Not open to work", hint: (n) => (n ? "Employers can't find them" : "Everyone is open to work"), nudge: "open_to_work", critical: true, ofTotal: true },
    ],
  },
  {
    title: "Students in the drive",
    tiles: [
      ALL_STUDENTS,
      { key: "online", label: "Online now", hint: (n) => (n ? "On Findtern right now" : "Nobody is online"), ofTotal: true, needsPresence: true },
      { key: "aiPending", label: "AI interview not done", hint: (n) => (n ? "Employers can't see them yet" : "Everyone has done it"), nudge: "interview", critical: true, ofTotal: true },
      { key: "shortlisted", label: "Shortlisted", figure: (b) => b.shortlistCount, hint: (n) => (n ? "By at least one company" : "Nobody shortlisted yet") },
    ],
  },
  MEETINGS,
  OFFERS,
  { title: "Nudges sent", tiles: NUDGES },
];
/** Once it is over: read-only. Who got what, who placed, and the nudges that were sent. */
const PAST: Group[] = [
  {
    title: "Students",
    tiles: [
      ALL_STUDENTS,
      { key: "offers", label: "Got an offer", hint: (n, b) => (n ? OFFER_COUNTS(b) : "No offer was made") },
      { key: "hired", label: "Hired", hint: (n) => (n ? "Hired by a company" : "No hire") },
      { key: "unanswered", label: "Didn't answer any offer", hint: (n) => (n ? "Had offers and never replied" : "Everyone replied to something") },
    ],
  },
  // The same Meetings and Offers figures as while the drive ran: one set of stages, live and past.
  MEETINGS,
  OFFERS,
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
const PAST_ALIAS: Partial<Record<BoardKey, BoardKey>> = { meetingsWaiting: "meetExpired", offersWaiting: "unanswered", offline: "all", online: "all", notOpen: "all", aiPending: "all" };
const PAGE = 40;
const GRID = {
  2: "grid grid-cols-2 divide-x divide-ink-100 border-b border-ink-100",
  3: "grid grid-cols-3 divide-x divide-ink-100 border-b border-ink-100",
  6: "grid grid-cols-2 divide-ink-100 border-b border-ink-100 max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(even)]:border-l sm:grid-cols-3 sm:[&>*:nth-child(n+4)]:border-t sm:[&>*:not(:nth-child(3n+1))]:border-l",
  8: "grid grid-cols-2 divide-ink-100 border-b border-ink-100 max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(even)]:border-l sm:grid-cols-4 sm:[&>*:nth-child(n+5)]:border-t sm:[&>*:not(:nth-child(4n+1))]:border-l",
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
  // Bug 26 Nov: a tile opens its list and brings it into view (smooth unless the reader asked for reduced motion).
  const listTop = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  // Bug sheet 26 Nov: find a student in the open list by name, phone or email.
  const [q, setQ] = useState("");
  const tile = all.find((t) => t.key === sel)!;
  const rows = board.lists[sel];
  const found = q.trim() ? rows.filter((r) => matches([r.name, r.phone, r.email], q)) : rows;
  const shown = showAll || q.trim() ? found : found.slice(0, PAGE);
  // Nudging is for a running drive only. On a nudge-history list it goes to who still needs it, not to everyone once nudged.
  const canNudge = Boolean(tile.nudge) && open;
  const nudgeIds = (tile.key.startsWith("nudged") ? rows.filter((r) => r.again) : rows).map((r) => r.userId);
  // "Nudge all" wherever a list has more than one student to chase (bug sheet 27 Nov); one student has the row's own button.
  // A list without a nudge of its own (Meets sent, Booked) chases each student's meets: a reply, or a reminder to turn up.
  const meetIds = (k: "meeting" | "meeting_reminder") => rows.filter((r) => r.meetNudge === k).map((r) => r.userId);
  const batches: { kind: NudgeHistoryKind | "interview" | "meeting_reminder"; ids: string[]; label: string }[] = !open
    ? []
    : canNudge
      ? nudgeIds.length > 1 ? [{ kind: tile.nudge!, ids: nudgeIds, label: tile.key.startsWith("nudged") ? `Nudge again ${nudgeIds.length}` : `Nudge all ${nudgeIds.length}` }] : []
      : [
          { kind: "meeting" as const, ids: meetIds("meeting"), label: `Nudge all ${meetIds("meeting").length} to reply` },
          { kind: "meeting_reminder" as const, ids: meetIds("meeting_reminder"), label: `Remind all ${meetIds("meeting_reminder").length}` },
        ].filter((b) => b.ids.length > 1);

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
          setQ("");
          requestAnimationFrame(() => {
            const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            listTop.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
          });
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
          <div className={g.tiles.length === 2 ? GRID[2] : g.tiles.length === 3 ? GRID[3] : g.tiles.length === 6 || g.tiles.length === 9 ? GRID[6] : g.tiles.length === 8 ? GRID[8] : GRID[4]}>{g.tiles.map(button)}</div>
        </TileGroup>
      ))}

      <div ref={listTop} id="board-list" className="flex scroll-mt-24 flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h3 className="text-sm font-semibold text-ink-900">
          {tile.label} <span className="nums font-normal text-text-subtle">· {rows.length.toLocaleString("en-IN")} {rows.length === 1 ? "student" : "students"}</span>
        </h3>
        <label className="relative order-last w-full sm:order-none sm:ml-auto sm:w-72">
          <span className="sr-only">Search {tile.label.toLowerCase()} by name, phone or email</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone or email"
            className="h-10 w-full rounded-apple-sm border border-ink-200 bg-white pl-9 pr-3 text-base text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20 md:text-sm"
          />
        </label>
        {batches.map((x) => (
          <NudgeButton key={`${sel}-${x.kind}-${x.ids.length}`} kind={x.kind} userIds={x.ids} label={x.label} emphasis />
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-ink-100 px-5 py-6 text-sm text-text-subtle">{open ? "Nobody here right now." : "Nobody here."}</p>
      ) : found.length === 0 ? (
        <p role="status" className="border-t border-ink-100 px-5 py-6 text-sm text-text-subtle">
          No student in this list matches &ldquo;{q.trim()}&rdquo;.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {shown.map((r) => (
            <Row key={r.userId} r={r} nudge={open ? (r.meetNudge ?? (canNudge && r.again !== false ? tile.nudge : undefined)) : undefined} />
          ))}
        </ul>
      )}
      {found.length > PAGE && !showAll && !q.trim() ? (
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
export function Row({ r, nudge }: { r: BoardItem; nudge?: NudgeHistoryKind | "interview" | "meeting_reminder" }) {
  const meta = [r.year ? yearLabel(r.year) : null, r.branch].filter(Boolean).join(" · ");
  return (
    <li className="grid gap-x-6 gap-y-1.5 px-5 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0">
        <Link href={`/college/students/${r.userId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
          {r.name || "Student"}
        </Link>
        {meta ? <p className="truncate text-xs text-text-subtle">{meta}</p> : null}
      </div>
      <p className="min-w-0 whitespace-pre-line text-sm text-ink-700">{r.detail}</p>
      {r.phone ? (
        <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="nums inline-flex items-center gap-1.5 text-sm text-ink-700 hover:text-brand-700">
          <Phone className="size-3.5 text-ink-400" aria-hidden />
          {r.phone}
        </a>
      ) : (
        <span className="text-sm text-ink-400">No phone</span>
      )}
      <span className="sm:justify-self-end">{nudge ? <NudgeButton kind={nudge} userIds={[r.userId]} label={nudge === "meeting_reminder" ? "Remind" : "Nudge"} size="xs" /> : null}</span>
    </li>
  );
}
