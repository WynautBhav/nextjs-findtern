"use client";

import { useRef, useState } from "react";
import { Mail, Phone } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { BoardItem, BoardKey, DriveBoard } from "@/lib/college/drive-board";
import type { DriveEmployers, EmployerRow } from "@/lib/college/drive-employers";
import type { DriveSummary } from "@/lib/college/drive-summary";
import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Row } from "./drive-board-view";
import { CollegeHero } from "./kit";
import { PastDriveCharts, type Pop } from "./past-drive-charts";
import { duration } from "./drive-summary";

/**
 * A finished drive as one card on the hero field (owner brief, 24 Nov 2026): Candidates and Employers behind the same
 * pill tabs as the dashboard hero, and every figure opens its full list in a pop-up instead of scrolling the page.
 * Read-only: names and phones show, nothing can be sent. Colour is white at set strengths plus one gold (the hires),
 * as on the dashboard hero (hero-modes/kit.tsx).
 */

const n = (v: number) => v.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;
const when = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

type Tab = "candidates" | "employers";

/** A past drive's old "still waiting" lists, asked for by a link (?show=): what they became once it ended. */
const PAST_ALIAS: Partial<Record<string, BoardKey>> = { meetingsWaiting: "meetExpired", offersWaiting: "unanswered", offline: "all", online: "all", notOpen: "all" };
const LIST_TITLE: Partial<Record<BoardKey, string>> = {
  all: "Students in the drive",
  called: "Asked to meet",
  meetings: "Meets accepted",
  meetCompleted: "Meets completed",
  meetExpired: "Meets expired",
  offers: "Got an offer",
  hired: "Hired",
  internships: "Hired for an internship",
  fullTime: "Hired full-time / PPO",
  declinedAll: "Turned every offer down",
  unanswered: "Never replied to an offer",
  nudgedOnline: "Nudged to come online",
  nudgedOpenToWork: "Nudged to turn on Open to work",
  nudgedMeet: "Nudged to answer a meet",
  nudgedOffer: "Nudged to reply to an offer",
};

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-white/80";

export function PastDriveCard({
  hero,
  scores,
  window,
  board,
  byEmployer,
  employers,
  summary,
  finding,
  initialShow,
  timeline,
  spread,
  activity,
  activityCount,
}: {
  hero: { title: string; lede: string };
  /** Findtern score per student (null: not interviewed), for the score-band chart. */
  scores: Record<string, number | null>;
  window: { start: Date; end: Date };
  board: DriveBoard;
  byEmployer: Record<string, DriveBoard>;
  employers: DriveEmployers;
  summary: DriveSummary;
  finding: string;
  initialShow?: string;
  /** Server-drawn parts, shown inside the card or its pop-ups. */
  timeline: React.ReactNode;
  spread: React.ReactNode | null;
  activity: React.ReactNode;
  activityCount: number;
}) {
  const [tab, setTab] = useState<Tab>("candidates");
  const asked = initialShow ? (PAST_ALIAS[initialShow] ?? (initialShow as BoardKey)) : null;
  const [pop, setPop] = useState<Pop | null>(asked && board.lists[asked] ? listPop(asked, board) : null);
  const L = board.lists;
  const total = L.all.length;
  const came = employers.rows.filter((r) => r.employerId);
  const invited = employers.rows.filter((r) => r.invited).length;
  const minutesOf = new Map(summary.online.employers.map((e) => [e.employerId, e.minutes]));
  const best = [...came].sort((a, b) => b.hires - a.hires || b.offers - a.offers)[0];
  const employerFinding = !came.length
    ? "No company came into this drive."
    : `${plural(came.length, "company", "companies")} came${invited ? ` (${n(employers.rows.filter((r) => r.invited && r.employerId).length)} of ${n(invited)} invited)` : ""}. ${best && best.offers ? `${best.company} made the most offers (${n(best.offers)}) and hired ${n(best.hires)}.` : "No offer was made."}`;
  // The figure that opened the pop-up gets the focus back when it closes (Radix only does that for its own Trigger).
  const opener = useRef<HTMLElement | null>(null);
  const open = (p: Pop) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPop(p);
  };

  const everyone = summary.online.everyone;
  const onlinePop = (on: boolean): Pop => {
    const rows = everyone.filter((x) => (on ? x.minutes > 0 : x.minutes === 0));
    return { kind: "slot", title: on ? "Came online in the drive" : "Never online in the drive", note: plural(rows.length, "student", "students"), body: on ? <Minutes rows={rows} /> : <Names rows={rows} /> };
  };

  return (
    <>
    <CollegeHero title={hero.title} lede={hero.lede}>
    <div className="mt-6">
      <div role="tablist" aria-label="Drive view" className="inline-flex flex-wrap gap-1 rounded-full bg-white/10 p-1">
        {(["candidates", "employers"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`past-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="past-panel"
            onClick={() => setTab(t)}
            className={cn("min-h-9 rounded-full px-4 text-sm font-medium transition-colors max-lg:min-h-11", focusRing, tab === t ? "bg-white text-brand-900" : "text-white/80 hover:bg-white/10 hover:text-white")}
          >
            {t === "candidates" ? "Candidates" : "Employers"}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="past-panel" aria-labelledby={`past-tab-${tab}`}>
        {tab === "candidates" ? (
          <>
            <p className="mt-6 max-w-3xl text-pretty text-base text-white">{finding}</p>
            <ol aria-label="Drive pipeline" className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
              {(
                [
                  ["all", "Students in the drive", total, null],
                  ["called", "Asked to meet", L.called.length, "of the drive"],
                  ["offers", "Got an offer", L.offers.length, "of the drive"],
                  ["hired", "Hired", L.hired.length, "of those offered"],
                ] as const
              ).map(([key, label, value, of], i) => {
                const base = key === "hired" ? L.offers.length : total;
                return (
                  <li key={key}>
                    <Big label={label} value={value} gold={key === "hired"} share={i ? `${pct(value, base)}% ${of}` : null} bar={i ? pct(value, base) : 100} onClick={() => open(listPop(key, board))} />
                  </li>
                );
              })}
            </ol>

            <div className="mt-8 grid gap-x-8 gap-y-7 border-t border-white/10 pt-6 sm:grid-cols-2 xl:grid-cols-4">
              <Ledger title="Meetings">
                <Line label="Meets sent" value={board.meetCounts.sent} onClick={() => open(listPop("called", board))} />
                <Line label="Accepted" value={board.meetCounts.accepted} onClick={() => open(listPop("meetings", board))} />
                <Line label="Completed" value={board.meetCounts.completed} onClick={() => open(listPop("meetCompleted", board))} />
                <Line label="Expired, no reply" value={board.meetCounts.expired} onClick={() => open(listPop("meetExpired", board))} />
              </Ledger>
              <Ledger title="Offers">
                <Line label="Offers made" value={board.offerCount} onClick={() => open(listPop("offers", board))} />
                <Line label="Hired, internship" value={L.internships.length} onClick={() => open(listPop("internships", board))} />
                <Line label="Hired, full-time / PPO" value={L.fullTime.length} gold onClick={() => open(listPop("fullTime", board))} />
                <Line label="Turned every offer down" value={L.declinedAll.length} onClick={() => open(listPop("declinedAll", board))} />
                <Line label="Never replied" value={L.unanswered.length} onClick={() => open(listPop("unanswered", board))} />
              </Ledger>
              <Ledger title="Nudges sent">
                <Line label="Come online" value={board.nudgeCounts.nudgedOnline} onClick={() => open(listPop("nudgedOnline", board))} />
                <Line label="Turn on Open to work" value={board.nudgeCounts.nudgedOpenToWork} onClick={() => open(listPop("nudgedOpenToWork", board))} />
                <Line label="Answer a meet request" value={board.nudgeCounts.nudgedMeet} onClick={() => open(listPop("nudgedMeet", board))} />
                <Line label="Reply to an offer" value={board.nudgeCounts.nudgedOffer} onClick={() => open(listPop("nudgedOffer", board))} />
              </Ledger>
              <Ledger title="Online and reach">
                {summary.tracked === "none" ? (
                  <li className="py-1.5 text-sm text-on-dark">Online time not recorded.</li>
                ) : (
                  <>
                    <Line
                      label="Average time online"
                      value={summary.online.studentsAvg}
                      text={duration(summary.online.studentsAvg)}
                      onClick={() => open({ kind: "slot", title: "Time online, most first", note: `Average ${duration(summary.online.studentsAvg)} per student.${summary.tracked === "partial" ? " Recorded for part of the drive only." : ""}`, body: <Minutes rows={everyone.filter((x) => x.minutes > 0)} /> })}
                    />
                    <Line label="Came online" value={summary.online.studentsEver} onClick={() => open(onlinePop(true))} />
                    <Line label={summary.tracked === "partial" ? "Not seen since recording began" : "Never online"} value={summary.online.neverOnlineCount} onClick={() => open(onlinePop(false))} />
                  </>
                )}
                <Line
                  label="Median reply to a meet"
                  value={summary.speed.meetMedianMin}
                  text={summary.speed.meetMedianMin === null ? "—" : duration(summary.speed.meetMedianMin)}
                  onClick={summary.speed.slowMeet.length ? () => open({ kind: "slot", title: "Slowest to answer a meet", note: `Half replied faster than ${duration(summary.speed.meetMedianMin)}.`, body: <Minutes rows={summary.speed.slowMeet} /> }) : undefined}
                />
                <Line
                  label="Strong, not reached"
                  value={summary.missed.count}
                  onClick={() => open({ kind: "slot", title: "Strong students not reached", note: "Findtern score 8 or more, with no meet request and no offer.", body: <Strong rows={summary.missed.rows} /> })}
                />
              </Ledger>
            </div>
          </>
        ) : (
          <>
            <p className="mt-6 max-w-3xl text-pretty text-base text-white">{employerFinding}</p>
            <ol aria-label="Employers in the drive" className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
              <li>
                <Big
                  label="Companies came"
                  value={came.length}
                  share={invited ? `of ${n(invited)} invited` : null}
                  bar={invited ? pct(employers.rows.filter((r) => r.invited && r.employerId).length, invited) : 100}
                  onClick={() => open({ kind: "slot", title: "Companies in the drive", note: `${plural(came.length, "company", "companies")} came${employers.invitedMissing ? ` · ${plural(employers.invitedMissing, "invited company", "invited companies")} didn't` : ""}`, body: <Companies rows={employers.rows} minutes={minutesOf} tracked={summary.tracked !== "none"} /> })}
                />
              </li>
              <li>
                <Big label="Meets sent" value={board.meetCounts.sent} share={`${n(board.meetCounts.accepted)} accepted`} bar={pct(board.meetCounts.accepted, board.meetCounts.sent)} onClick={() => open(listPop("called", board))} />
              </li>
              <li>
                <Big label="Offers made" value={board.offerCount} share={`${n(board.offerSplit.fullTime)} full-time · ${n(board.offerSplit.internship)} internship`} bar={pct(L.offers.length, total)} onClick={() => open(listPop("offers", board))} />
              </li>
              <li>
                <Big label="Hired" value={L.hired.length} gold share={`${pct(L.hired.length, L.offers.length)}% of those offered`} bar={pct(L.hired.length, L.offers.length)} onClick={() => open(listPop("hired", board))} />
              </li>
            </ol>

            <div className="mt-8 border-t border-white/10 pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium text-white">Each company</h2>
                {activityCount ? (
                  <button type="button" aria-haspopup="dialog" onClick={() => open({ kind: "slot", title: "Company activity", note: "What each company did in this drive, newest first.", body: activity })} className={cn("min-h-9 rounded-sm text-sm text-on-dark underline-offset-4 hover:text-white hover:underline", focusRing)}>
                    Company activity <span className="nums text-white">{n(activityCount)}</span>
                  </button>
                ) : null}
              </div>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-on-dark max-sm:sr-only">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-normal">Company</th>
                    <th scope="col" className="hidden py-2 pr-3 font-normal md:table-cell">Joined</th>
                    <th scope="col" className="hidden py-2 pr-3 text-right font-normal md:table-cell">Online</th>
                    <th scope="col" className="py-2 pr-3 text-right font-normal">Meets</th>
                    <th scope="col" className="py-2 pr-3 text-right font-normal">Offers</th>
                    <th scope="col" className="py-2 text-right font-normal">Hired</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 border-t border-white/10">
                  {employers.rows.map((r) => {
                    const id = r.employerId;
                    const mins = id ? minutesOf.get(id) : undefined;
                    return (
                      <tr key={r.key} className={cn(!id && "text-on-dark")}>
                        <th scope="row" className="py-1 pr-3 text-left font-normal">
                          {id ? (
                            <button type="button" aria-haspopup="dialog" onClick={() => open({ kind: "company", id })} className={cn("-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center rounded-md px-2 text-left font-medium text-white hover:bg-white/10", focusRing)}>
                              <span className="truncate">{r.company}</span>
                            </button>
                          ) : (
                            <span className="flex min-h-11 items-center gap-2">
                              <span className="truncate">{r.company}</span>
                              <span className="shrink-0 text-xs">Didn&apos;t come</span>
                            </span>
                          )}
                        </th>
                        <td className="nums hidden py-1 pr-3 text-on-dark md:table-cell">{r.joinedAt ? when(r.joinedAt) : "—"}</td>
                        <td className="nums hidden py-1 pr-3 text-right text-on-dark md:table-cell">{mins === undefined || summary.tracked === "none" ? "—" : duration(mins)}</td>
                        <Num v={id ? r.meetings : null} />
                        <Num v={id ? r.offers : null} />
                        <Num v={id ? r.hires : null} gold last />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-6 border-t border-white/10 pt-5">{timeline}</div>
          </>
        )}
      </div>

      <Dialog open={pop !== null} onOpenChange={(o) => { if (!o) setPop(null); }}>
        <DialogContent onCloseAutoFocus={(e) => { if (opener.current) { e.preventDefault(); opener.current.focus(); } }} className="drill-panel flex max-h-[calc(100dvh-2rem)] w-[min(56rem,calc(100%-2rem))] max-w-none flex-col gap-0 overflow-hidden bg-ink-50 p-0 sm:max-w-none">
          {pop ? <PopBody pop={pop} board={board} byEmployer={byEmployer} employers={employers.rows} minutes={minutesOf} tracked={summary.tracked !== "none"} /> : null}
        </DialogContent>
      </Dialog>
    </div>
    </CollegeHero>
    <PastDriveCharts board={board} employers={employers} summary={summary} scores={scores} window={window} spread={spread} open={open} listPop={(k) => listPop(k, board)} />
    </>
  );
}

function listPop(key: BoardKey, board: DriveBoard): Pop {
  const rows = board.lists[key].length;
  const note =
    key === "called" ? `${plural(board.meetCounts.sent, "meet request", "meet requests")} to ${plural(rows, "student", "students")}`
    : key === "offers" ? `${plural(board.offerCount, "offer", "offers")} to ${plural(rows, "student", "students")} · ${n(board.offerSplit.fullTime)} full-time / PPO`
    : plural(rows, "student", "students");
  return { kind: "list", key, title: LIST_TITLE[key] ?? "Students", note };
}

/** A pipeline figure: label, a large number, its share, and a bar on the shared 0-100 scale. The whole block opens its list. */
function Big({ label, value, share, bar, gold, onClick }: { label: string; value: number; share: string | null; bar: number; gold?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-haspopup="dialog" onClick={onClick} className={cn("group -m-2 block w-[calc(100%+1rem)] rounded-lg p-2 text-left transition-colors hover:bg-white/[0.06]", focusRing)}>
      <span className="flex items-baseline justify-between gap-2 text-[13px] font-medium text-on-dark">
        {label}
      </span>
      <span className={cn("nums mt-2 block text-[2.75rem] font-light leading-none tracking-[-0.03em]", value === 0 ? "text-white/40" : gold ? "text-accent-300" : "text-white")}>{n(value)}</span>
      <span aria-hidden className="mt-3 block h-1 overflow-hidden rounded-full bg-white/15">
        <span className={cn("block h-full rounded-full", gold ? "bg-accent-400" : "bg-white/80")} style={{ width: `${value > 0 ? Math.max(2, bar) : 0}%` }} />
      </span>
      <span className="nums mt-2 block text-xs text-on-dark group-hover:text-white">{share ?? " "}</span>
    </button>
  );
}

function Ledger({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h2 className="text-sm font-medium text-white">{title}</h2>
      <ul className="mt-2 divide-y divide-white/10">{children}</ul>
    </section>
  );
}

/** One figure in a ledger: label left, number right. With `onClick` the row opens its list. */
function Line({ label, value, text, gold, onClick }: { label: string; value?: number | null; text?: string; gold?: boolean; onClick?: () => void }) {
  const shown = text ?? (value === null || value === undefined ? "—" : n(value));
  const quiet = value === 0 || value === null;
  const body = (
    <>
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn("nums shrink-0 text-right", quiet ? "text-white/40" : gold ? "text-accent-300" : "text-white")}>{shown}</span>
    </>
  );
  return (
    <li>
      {onClick ? (
        <button type="button" aria-haspopup="dialog" onClick={onClick} className={cn("-mx-2 flex min-h-10 w-[calc(100%+1rem)] items-center justify-between gap-4 rounded-md px-2 text-left text-sm text-on-dark transition-colors hover:bg-white/[0.06] hover:text-white max-lg:min-h-11", focusRing)}>
          {body}
        </button>
      ) : (
        <span className="flex min-h-10 items-center justify-between gap-4 text-sm text-on-dark">{body}</span>
      )}
    </li>
  );
}

function Num({ v, gold, last }: { v: number | null; gold?: boolean; last?: boolean }) {
  return <td className={cn("nums py-1 text-right", !last && "pr-3", v === null ? "text-white/40" : v === 0 ? "text-white/40" : gold ? "text-accent-300" : "text-white")}>{v === null ? "—" : n(v)}</td>;
}

/** The pop-up: a title, one line on what it counts, then the full list on a white sheet. */
function PopBody({ pop, board, byEmployer, employers, minutes, tracked }: { pop: Pop; board: DriveBoard; byEmployer: Record<string, DriveBoard>; employers: EmployerRow[]; minutes: Map<string, number>; tracked: boolean }) {
  if (pop.kind === "company") {
    const r = employers.find((e) => e.employerId === pop.id);
    const b = byEmployer[pop.id];
    return r && b ? <CompanyPop r={r} b={b} minutes={minutes.get(pop.id)} tracked={tracked} /> : <Head title="Company" note="Nothing recorded for this company." />;
  }
  if (pop.kind === "items") {
    return (
      <>
        <Head title={pop.title} note={pop.note} />
        <Sheet>
          <Students rows={pop.rows} />
        </Sheet>
      </>
    );
  }
  if (pop.kind === "slot") {
    return (
      <>
        <Head title={pop.title} note={pop.note} />
        <Sheet>{pop.body}</Sheet>
      </>
    );
  }
  return (
    <>
      <Head title={pop.title} note={pop.note} />
      <Sheet>
        <Students rows={board.lists[pop.key]} />
      </Sheet>
    </>
  );
}

function Head({ title, note }: { title: string; note: string }) {
  return (
    <header className="drill-step border-b border-ink-200/70 px-5 pb-4 pt-5 pr-14 sm:px-6" style={{ "--i": 0 } as React.CSSProperties}>
      <DialogTitle className="text-lg font-semibold tracking-[-0.01em] text-ink-900">{title}</DialogTitle>
      <DialogDescription className="nums mt-0.5 text-sm text-ink-600">{note}</DialogDescription>
    </header>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="drill-step min-h-0 flex-1 overflow-y-auto bg-white" style={{ "--i": 1 } as React.CSSProperties}>
      {children}
    </div>
  );
}

function Students({ rows }: { rows: BoardItem[] }) {
  if (!rows.length) return <p className="px-5 py-8 text-sm text-text-subtle">Nobody here.</p>;
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((r) => (
        <Row key={r.userId} r={r} />
      ))}
    </ul>
  );
}

const COMPANY_LISTS: { key: BoardKey; label: string }[] = [
  { key: "called", label: "Asked to meet" },
  { key: "meetings", label: "Met" },
  { key: "offers", label: "Offered" },
  { key: "hired", label: "Hired" },
];

/** One company: who to call, its figures, and the students it asked, met, offered and hired. */
function CompanyPop({ r, b, minutes, tracked }: { r: EmployerRow; b: DriveBoard; minutes?: number; tracked: boolean }) {
  // Offers first: what an officer opens a company for. Else its first list with anyone in it.
  const first = b.lists.offers.length ? "offers" : (COMPANY_LISTS.find((l) => b.lists[l.key].length)?.key ?? "called");
  const [sel, setSel] = useState<BoardKey>(first);
  return (
    <>
      <header className="drill-step border-b border-ink-200/70 px-5 pb-4 pt-5 pr-14 sm:px-6" style={{ "--i": 0 } as React.CSSProperties}>
        <DialogTitle className="text-lg font-semibold tracking-[-0.01em] text-ink-900">{r.company}</DialogTitle>
        <DialogDescription className="nums mt-0.5 text-sm text-ink-600">
          {[r.contact, r.joinedAt ? `Joined ${when(r.joinedAt)}` : null, tracked && minutes !== undefined ? `${duration(minutes)} online` : null].filter(Boolean).join(" · ")}
        </DialogDescription>
        {r.phone || r.email ? (
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {r.phone ? (
              <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="nums inline-flex min-h-9 items-center gap-1.5 text-ink-700 hover:text-brand-700">
                <Phone className="size-3.5 text-ink-400" aria-hidden />
                {r.phone}
              </a>
            ) : null}
            {r.email ? (
              <a href={`mailto:${r.email}`} className="inline-flex min-h-9 items-center gap-1.5 text-ink-700 hover:text-brand-700">
                <Mail className="size-3.5 text-ink-400" aria-hidden />
                {r.email}
              </a>
            ) : null}
          </p>
        ) : null}
        <div role="group" aria-label="Students for this company" className="mt-3 flex flex-wrap gap-1">
          {COMPANY_LISTS.map((l) => (
            <button
              key={l.key}
              type="button"
              aria-pressed={sel === l.key}
              onClick={() => setSel(l.key)}
              className={cn(
                "nums min-h-9 rounded-full px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 max-lg:min-h-11",
                sel === l.key ? "bg-brand-50 text-brand-900 ring-1 ring-brand-200" : "text-ink-700 hover:bg-ink-100",
              )}
            >
              {l.label} <span className={sel === l.key ? "text-brand-700" : "text-text-subtle"}>{n(b.lists[l.key].length)}</span>
            </button>
          ))}
        </div>
      </header>
      <Sheet>
        <Students rows={b.lists[sel]} />
      </Sheet>
    </>
  );
}

function Companies({ rows, minutes, tracked }: { rows: EmployerRow[]; minutes: Map<string, number>; tracked: boolean }) {
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{r.company}</p>
            <p className="truncate text-xs text-text-subtle">{[r.contact, r.phone, r.email].filter(Boolean).join(" · ") || "No contact on file"}</p>
          </div>
          <p className="nums text-sm text-ink-700">
            {r.employerId ? (
              <>
                {r.joinedAt ? `Joined ${when(r.joinedAt)}` : "Came"}
                {tracked && r.employerId && minutes.has(r.employerId) ? ` · ${duration(minutes.get(r.employerId)!)} online` : ""}
              </>
            ) : (
              <span className="text-warning">Invited, didn&apos;t come</span>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Minutes({ rows }: { rows: { userId: string; name: string; minutes: number }[] }) {
  if (!rows.length) return <p className="px-5 py-8 text-sm text-text-subtle">Nothing recorded.</p>;
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((x, i) => (
        <li key={`${x.userId}-${i}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
          <a href={`/college/students/${x.userId}`} className="truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">{x.name}</a>
          <span className="nums shrink-0 text-ink-700">{duration(x.minutes)}</span>
        </li>
      ))}
    </ul>
  );
}

function Names({ rows }: { rows: { userId: string; name: string }[] }) {
  if (!rows.length) return <p className="px-5 py-8 text-sm text-text-subtle">Nobody here.</p>;
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((x) => (
        <li key={x.userId} className="px-5 py-3 text-sm">
          <a href={`/college/students/${x.userId}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">{x.name}</a>
        </li>
      ))}
    </ul>
  );
}

function Strong({ rows }: { rows: DriveSummary["missed"]["rows"] }) {
  if (!rows.length) return <p className="px-5 py-8 text-sm text-text-subtle">Every strong student was reached.</p>;
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((x) => (
        <li key={x.userId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-3 text-sm">
          <span className="min-w-0">
            <a href={`/college/students/${x.userId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">{x.name}</a>
            <span className="block truncate text-xs text-text-subtle">{[x.branch, x.year ? `Year ${x.year}` : null, x.phone].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="nums text-ink-700">{x.score?.toFixed(1) ?? "—"}</span>
        </li>
      ))}
    </ul>
  );
}
