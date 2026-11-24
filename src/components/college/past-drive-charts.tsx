"use client";

import { Surface } from "@/components/app/primitives";
import type { DriveReach, ReachBucketId } from "@/lib/college/drive-reach";
import { DriveReachView } from "./drive-reach-view";
import type { BoardItem, BoardKey, DriveBoard } from "@/lib/college/drive-board";
import type { DriveEmployers } from "@/lib/college/drive-employers";
import type { DriveSummary } from "@/lib/college/drive-summary";
import { COFFEE, coffeeOf, type CoffeeKey } from "@/lib/college/overview-modes";
import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The analysis under a finished drive's card: white surfaces like the dashboard's, one brand hue in steps (darker =
 * further down the pipeline), counts in ink, zeros in grey. Every bar is a button that opens its students in the same
 * pop-up the card uses. No chart library, no entrance motion.
 */

const n = (v: number) => v.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;
const day = (d: Date) =>
  shortDateTime(d, {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });

/** What a chart asks the page to open. */
export type Pop =
  | { kind: "list"; key: BoardKey; title: string; note: string }
  | { kind: "company"; id: string }
  | { kind: "items"; title: string; note: string; rows: BoardItem[] }
  | { kind: "employers"; title: string; note: string }
  | { kind: "slot"; title: string; note: string; body: React.ReactNode };

const ring = "outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

export function PastDriveCharts({
  reach,
  reachRows,
  board,
  employers,
  summary,
  scores,
  window,
  spread,
  open,
  listPop,
}: {
  reach: DriveReach;
  reachRows: Partial<Record<ReachBucketId, BoardItem[]>>;
  board: DriveBoard;
  employers: DriveEmployers;
  summary: DriveSummary;
  scores: Record<string, number | null>;
  window: { start: Date; end: Date };
  spread: React.ReactNode | null;
  open: (p: Pop) => void;
  listPop: (key: BoardKey) => Pop;
}) {
  const L = board.lists;
  const ref = new Map(L.all.map((s) => [s.userId, s]));
  /** Students (one row each) from per-offer or per-meet facts, with one line saying what happened. */
  const items = (ids: string[], line: (id: string) => string): BoardItem[] => [...new Set(ids)].filter((id) => ref.has(id)).map((id) => ({ ...ref.get(id)!, detail: line(id) }));
  const companies = (rows: { company: string | null }[]) => [...new Set(rows.map((r) => r.company?.trim() || "An employer"))].join(", ");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Who could take part" note={`${plural(reach.strength, "student", "students")} match the drive`} className="lg:col-span-2">
        <DriveReachView
          reach={reach}
          note="One reason each, the first that blocks, as things stand today."
          onOpen={(id) => {
            const b = reach.buckets.find((x) => x.id === id)!;
            open({ kind: "items", title: b.label, note: `${plural(b.ids.length, "student", "students")} employers couldn't see`, rows: reachRows[id] ?? [] });
          }}
        />
      </Card>
      <Funnel board={board} open={open} listPop={listPop} />
      <Outcomes board={board} open={open} items={items} companies={companies} />
      <Days board={board} window={window} open={open} items={items} companies={companies} />
      <Bands board={board} scores={scores} open={open} />
      <Online summary={summary} open={open} items={items} />
      <Companies board={board} employers={employers} open={open} />
      <NudgeChart board={board} summary={summary} open={open} listPop={listPop} />
      {spread ? (
        <Card title="Offers by branch and year" note={`${plural(L.offers.length, "student", "students")} offered · ${n(L.hired.length)} hired`} className="lg:col-span-2">
          {spread}
        </Card>
      ) : null}
    </div>
  );
}

function Card({ title, note, children, className }: { title: string; note: string; children: React.ReactNode; className?: string }) {
  return (
    <Surface className={cn("min-w-0 p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">{title}</h2>
        <p className="nums text-sm text-text-subtle">{note}</p>
      </div>
      <div className="mt-5">{children}</div>
    </Surface>
  );
}

/** A horizontal bar on a shared scale; `part` draws a darker share inside it (worked of sent, hired of offered). */
function Track({ value, of, part, tone = "bg-brand-500" }: { value: number; of: number; part?: number; tone?: string }) {
  const w = of > 0 ? (value / of) * 100 : 0;
  return (
    <span aria-hidden className="relative block h-2.5 overflow-hidden rounded-full bg-ink-100">
      <span className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${value > 0 ? Math.max(1.5, w) : 0}%` }} />
      {part ? <span className="absolute inset-y-0 left-0 rounded-full bg-brand-800" style={{ width: `${Math.max(1.5, (part / of) * 100)}%` }} /> : null}
    </span>
  );
}

/** One clickable row: label and figure on a line, its bar under them. */
function BarRow({ label, figure, sub, onClick, children }: { label: React.ReactNode; figure: React.ReactNode; sub?: React.ReactNode; onClick?: () => void; children: React.ReactNode }) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-ink-800">{label}</span>
        <span className="nums shrink-0 text-right text-ink-900">
          {figure}
          {sub ? <span className="text-text-subtle"> · {sub}</span> : null}
        </span>
      </span>
      <span className="mt-1.5 block">{children}</span>
    </>
  );
  return (
    <li>
      {onClick ? (
        <button type="button" aria-haspopup="dialog" onClick={onClick} className={cn("-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1.5 text-left hover:bg-ink-50", ring)}>
          {body}
        </button>
      ) : (
        <div className="py-1.5">{body}</div>
      )}
    </li>
  );
}

function Legend({
  items,
}: {
  items: {
    label: string;
    tone: string;
    value?: number;
    onClick?: () => void;
  }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-700">
      {items.map((i) => {
        const body = (
          <>
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", i.tone)} />
            {i.label}
            {i.value !== undefined ? <span className="nums font-medium text-ink-900">{n(i.value)}</span> : null}
          </>
        );
        return (
          <li key={i.label}>
            {i.onClick ? (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={i.onClick}
                className={cn("flex min-h-8 items-center gap-1.5 rounded-sm underline-offset-4 hover:text-ink-900 hover:underline", ring)}
              >
                {body}
              </button>
            ) : (
              <span className="flex min-h-8 items-center gap-1.5">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 1. Where students drop out: each step's share of the one before it. */
function Funnel({ board, open, listPop }: { board: DriveBoard; open: (p: Pop) => void; listPop: (k: BoardKey) => Pop }) {
  const L = board.lists;
  const total = L.all.length;
  const steps: {
    key: BoardKey;
    label: string;
    v: number;
    of: number;
    ofLabel: string;
  }[] = [
    { key: "all", label: "In the drive", v: total, of: total, ofLabel: "" },
    {
      key: "called",
      label: "Asked to meet",
      v: L.called.length,
      of: total,
      ofLabel: "of the drive",
    },
    {
      key: "meetings",
      label: "Met an employer",
      v: L.meetings.length,
      of: L.called.length,
      ofLabel: "of those asked",
    },
    {
      key: "offers",
      label: "Got an offer",
      v: L.offers.length,
      of: total,
      ofLabel: "of the drive",
    },
    {
      key: "hired",
      label: "Hired",
      v: L.hired.length,
      of: L.offers.length,
      ofLabel: "of those offered",
    },
  ];
  const worst = steps
    .slice(1)
    .filter((s) => s.of > 0)
    .sort((a, b) => a.v / a.of - b.v / b.of)[0];
  return (
    <Card title="Where students drop out" note={worst ? `Biggest drop: ${worst.label.toLowerCase()}, ${pct(worst.v, worst.of)}% ${worst.ofLabel}` : "No students in the drive"}>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <BarRow key={s.key} label={s.label} figure={<span className="font-semibold">{n(s.v)}</span>} sub={i ? `${pct(s.v, s.of)}% ${s.ofLabel}` : undefined} onClick={() => open(listPop(s.key))}>
            <Track value={s.v} of={total} tone={s.key === "hired" ? "bg-brand-800" : i >= 3 ? "bg-brand-600" : "bg-brand-400"} />
          </BarRow>
        ))}
      </ol>
    </Card>
  );
}

const OUTCOME = [
  { key: "accepted", label: "Accepted", tone: "bg-brand-800" },
  { key: "declined", label: "Declined", tone: "bg-brand-400" },
  { key: "open", label: "Never answered", tone: "bg-ink-300" },
] as const;

type OfferFact = DriveBoard["facts"]["offers"][number];
type OutcomeKey = (typeof OUTCOME)[number]["key"];

/** One kind of offer as a 100% bar: accepted, declined, never answered; each part opens its students. */
function OfferStack({ rows, label, onPick }: { rows: OfferFact[]; label: string; onPick: (key: OutcomeKey, label: string, rows: OfferFact[]) => void }) {
  return (
    <div>
      <p className="flex items-baseline justify-between text-sm">
        <span className="text-ink-800">{label}</span>
        <span className="nums text-ink-900">{plural(rows.length, "offer", "offers")}</span>
      </p>
      <div
        role="img"
        aria-label={`${label}: ${OUTCOME.map((o) => `${rows.filter((r) => r.outcome === o.key).length} ${o.label.toLowerCase()}`).join(", ")}`}
        className="mt-1.5 flex h-6 gap-0.5 overflow-hidden rounded-md bg-ink-100"
      >
        {OUTCOME.map((o) => {
          const c = rows.filter((r) => r.outcome === o.key).length;
          return c ? (
            <button
              key={o.key}
              type="button"
              aria-label={`${label}, ${o.label.toLowerCase()}: ${c}`}
              title={`${o.label}: ${c}`}
              onClick={() =>
                onPick(
                  o.key,
                  o.label,
                  rows.filter((r) => r.outcome === o.key),
                )
              }
              className={cn("nums h-full min-w-6 text-[11px] font-medium hover:opacity-85", ring, o.tone, o.key === "open" ? "text-ink-800" : "text-white")}
              style={{ width: `${(c / rows.length) * 100}%` }}
            >
              {c}
            </button>
          ) : null;
        })}
      </div>
    </div>
  );
}

/** 2. What became of every offer, internship and full-time apart. */
function Outcomes({
  board,
  open,
  items,
  companies,
}: {
  board: DriveBoard;
  open: (p: Pop) => void;
  items: (ids: string[], line: (id: string) => string) => BoardItem[];
  companies: (r: { company: string | null }[]) => string;
}) {
  const offers = board.facts.offers;
  const pick = (o: (typeof offers)[number]["outcome"]) => offers.filter((x) => x.outcome === o);
  const openList = (key: (typeof OUTCOME)[number]["key"], label: string, rows = pick(key)) =>
    open({
      kind: "items",
      title: `Offers ${label.toLowerCase()}`,
      note: `${plural(rows.length, "offer", "offers")} to ${plural(new Set(rows.map((r) => r.userId)).size, "student", "students")}`,
      rows: items(
        rows.map((r) => r.userId),
        (id) => `${label} · ${companies(rows.filter((r) => r.userId === id))}`,
      ),
    });
  const acc = pick("accepted").length;
  return (
    <Card title="What happened to the offers" note={offers.length ? `${pct(acc, offers.length)}% accepted` : "No offer was made"}>
      {offers.length ? (
        <div className="space-y-5">
          <Legend
            items={OUTCOME.map((o) => ({
              label: o.label,
              tone: o.tone,
              value: pick(o.key).length,
              onClick: () => openList(o.key, o.label),
            }))}
          />
          <OfferStack rows={offers.filter((o) => o.fullTime)} label="Full-time / PPO" onPick={openList} />
          <OfferStack rows={offers.filter((o) => !o.fullTime)} label="Internship" onPick={openList} />
        </div>
      ) : (
        <p className="text-sm text-ink-700">No company made an offer in this drive.</p>
      )}
    </Card>
  );
}

/** 3. Day by day: meet requests and offers on each day of the drive (weeks when it ran longer than a month). */
function Days({
  board,
  window,
  open,
  items,
  companies,
}: {
  board: DriveBoard;
  window: { start: Date; end: Date };
  open: (p: Pop) => void;
  items: (ids: string[], line: (id: string) => string) => BoardItem[];
  companies: (r: { company: string | null }[]) => string;
}) {
  const DAY = 86_400_000;
  const days = Math.max(1, Math.ceil((window.end.getTime() - window.start.getTime()) / DAY));
  const step = days > 31 ? 7 : 1;
  const buckets = Array.from({ length: Math.ceil(days / step) }, (_, i) => {
    const from = new Date(window.start.getTime() + i * step * DAY);
    const to = new Date(Math.min(window.end.getTime(), from.getTime() + step * DAY));
    const inB = (d: Date) => d >= from && (d < to || (i === Math.ceil(days / step) - 1 && d <= to));
    return {
      from,
      meets: board.facts.meets.filter((m) => inB(m.at)),
      offers: board.facts.offers.filter((o) => inB(o.at)),
    };
  });
  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.meets.length, b.offers.length)));
  const busiest = [...buckets].sort((a, b) => b.meets.length + b.offers.length - (a.meets.length + a.offers.length))[0];
  const label = (b: (typeof buckets)[number]) => (step === 7 ? `Week of ${day(b.from)}` : day(b.from));
  return (
    <Card
      title={step === 7 ? "Week by week" : "Day by day"}
      note={busiest && busiest.meets.length + busiest.offers.length ? `Busiest: ${label(busiest)}` : "Nothing happened in the drive"}
      className="lg:col-span-2"
    >
      <Legend
        items={[
          {
            label: "Meet requests",
            tone: "bg-brand-300",
            value: board.facts.meets.length,
          },
          {
            label: "Offers",
            tone: "bg-brand-700",
            value: board.facts.offers.length,
          },
        ]}
      />
      <div className="mt-4 overflow-x-auto">
        <ol className="flex h-48 min-w-full items-end gap-2" style={{ minWidth: `${buckets.length * 2.75}rem` }}>
          {buckets.map((b) => {
            const total = b.meets.length + b.offers.length;
            const on = () =>
              open({
                kind: "items",
                title: label(b),
                note: `${plural(b.meets.length, "meet request", "meet requests")} · ${plural(b.offers.length, "offer", "offers")}`,
                rows: items(
                  [...b.offers, ...b.meets].map((x) => x.userId),
                  (id) =>
                    [
                      b.offers.some((o) => o.userId === id) ? `Offer from ${companies(b.offers.filter((o) => o.userId === id))}` : null,
                      b.meets.some((m) => m.userId === id) ? `Meet request from ${companies(b.meets.filter((m) => m.userId === id))}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                ),
              });
            return (
              <li key={b.from.toISOString()} className="flex h-full min-w-0 flex-1 flex-col">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  disabled={!total}
                  aria-label={`${label(b)}: ${b.meets.length} meet requests, ${b.offers.length} offers`}
                  title={`${label(b)}: ${b.meets.length} meet requests, ${b.offers.length} offers`}
                  onClick={on}
                  className={cn("flex min-h-0 flex-1 items-end justify-center gap-[3px] rounded-md px-1 pt-5 enabled:hover:bg-ink-50 disabled:cursor-default", ring)}
                >
                  {[
                    { v: b.meets.length, tone: "bg-brand-300" },
                    { v: b.offers.length, tone: "bg-brand-700" },
                  ].map((s, i) => (
                    <span key={i} className="relative flex h-full w-full max-w-10 items-end">
                      <span
                        className={cn("w-full rounded-t-[3px]", s.v ? s.tone : "bg-ink-100")}
                        style={{
                          height: s.v ? `${Math.max(4, (s.v / peak) * 100)}%` : "2px",
                        }}
                      />
                      {s.v ? (
                        <span
                          className="nums absolute inset-x-0 text-center text-[11px] text-ink-700"
                          style={{
                            bottom: `calc(${Math.max(4, (s.v / peak) * 100)}% + 2px)`,
                          }}
                        >
                          {s.v}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </button>
                <span className="nums mt-1.5 truncate text-center text-[11px] text-text-subtle">{day(b.from)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

/** 4. Did employers pick the strong students: each Findtern score band, how many were asked, offered and hired. */
function Bands({ board, scores, open }: { board: DriveBoard; scores: Record<string, number | null>; open: (p: Pop) => void }) {
  const L = board.lists;
  const asked = new Set(L.called.map((s) => s.userId));
  const offered = new Set(L.offers.map((s) => s.userId));
  const hired = new Set(L.hired.map((s) => s.userId));
  const bandOf = (id: string): CoffeeKey | "none" => (scores[id] == null ? "none" : coffeeOf(scores[id]!));
  const rows = [
    ...COFFEE.map((c) => ({
      key: c.key as CoffeeKey | "none",
      label: `${c.name} · ${c.range}`,
    })),
    { key: "none" as const, label: "Not interviewed" },
  ]
    .map((b) => {
      const ids = L.all.filter((s) => bandOf(s.userId) === b.key);
      return {
        ...b,
        ids,
        asked: ids.filter((s) => asked.has(s.userId)).length,
        offered: ids.filter((s) => offered.has(s.userId)).length,
        hired: ids.filter((s) => hired.has(s.userId)).length,
      };
    })
    .filter((b) => b.ids.length);
  const latte = rows.find((r) => r.key === "latte");
  const step = (id: string) => (hired.has(id) ? "Hired" : offered.has(id) ? "Got an offer" : asked.has(id) ? "Asked to meet" : "Not reached");
  return (
    <Card title="Did employers pick strong students" note={latte ? `${pct(latte.offered, latte.ids.length)}% of Latte students got an offer` : "By Findtern score band"}>
      <Legend
        items={[
          { label: "Got an offer", tone: "bg-brand-400" },
          { label: "Hired", tone: "bg-brand-800" },
        ]}
      />
      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <BarRow
            key={r.key}
            label={r.label}
            figure={
              <>
                <span className="font-semibold">{n(r.offered)}</span> offered
              </>
            }
            sub={`${n(r.hired)} hired of ${n(r.ids.length)}`}
            onClick={() =>
              open({
                kind: "items",
                title: r.label,
                note: `${plural(r.ids.length, "student", "students")} · ${n(r.asked)} asked to meet · ${n(r.offered)} offered · ${n(r.hired)} hired`,
                rows: [...r.ids]
                  .sort((a, b) => (scores[b.userId] ?? 0) - (scores[a.userId] ?? 0))
                  .map((s) => ({
                    ...s,
                    detail: `${step(s.userId)}${scores[s.userId] != null ? ` · score ${scores[s.userId]!.toFixed(1)}` : ""}`,
                  })),
              })
            }
          >
            <Track value={r.offered} of={r.ids.length} part={r.hired} tone="bg-brand-400" />
          </BarRow>
        ))}
      </ul>
    </Card>
  );
}

const ONLINE_BUCKETS: { label: string; test: (m: number) => boolean }[] = [
  { label: "Never", test: (m) => m === 0 },
  { label: "Under 30 min", test: (m) => m > 0 && m < 30 },
  { label: "30 min to 1 h", test: (m) => m >= 30 && m < 60 },
  { label: "1 to 2 h", test: (m) => m >= 60 && m < 120 },
  { label: "2 to 4 h", test: (m) => m >= 120 && m < 240 },
  { label: "4 h or more", test: (m) => m >= 240 },
];

/** 5. How long students were on Findtern during the drive. */
function Online({ summary, open, items }: { summary: DriveSummary; open: (p: Pop) => void; items: (ids: string[], line: (id: string) => string) => BoardItem[] }) {
  const all = summary.online.everyone;
  const mins = new Map(all.map((s) => [s.userId, s.minutes]));
  const buckets = ONLINE_BUCKETS.map((b) => ({
    ...b,
    rows: all.filter((s) => b.test(s.minutes)),
  }));
  const peak = Math.max(1, ...buckets.map((b) => b.rows.length));
  const fmt = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
  return (
    <Card
      title="Time online"
      note={summary.tracked === "none" ? "Not recorded for this drive" : `Average ${fmt(summary.online.studentsAvg ?? 0)} per student${summary.tracked === "partial" ? " · part of the drive" : ""}`}
    >
      {summary.tracked === "none" || !all.length ? (
        <p className="text-sm text-ink-700">Online time was not recorded while this drive ran.</p>
      ) : (
        <>
          <ol className="flex h-44 items-end gap-2">
            {buckets.map((b, i) => (
              <li key={b.label} className="flex h-full min-w-0 flex-1 flex-col">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  disabled={!b.rows.length}
                  aria-label={`${b.label}: ${b.rows.length} students`}
                  onClick={() =>
                    open({
                      kind: "items",
                      title: `Online ${b.label.toLowerCase()}`,
                      note: plural(b.rows.length, "student", "students"),
                      rows: items(
                        b.rows.map((r) => r.userId),
                        (id) => (mins.get(id) ? `${fmt(mins.get(id)!)} online` : "Never online in the drive"),
                      ),
                    })
                  }
                  className={cn("relative flex min-h-0 flex-1 items-end rounded-md px-1 pt-5 enabled:hover:bg-ink-50 disabled:cursor-default", ring)}
                >
                  <span
                    className={cn("w-full rounded-t-[3px]", b.rows.length ? (i === 0 ? "bg-ink-300" : i >= 4 ? "bg-brand-800" : i >= 2 ? "bg-brand-500" : "bg-brand-300") : "bg-ink-100")}
                    style={{
                      height: b.rows.length ? `${Math.max(4, (b.rows.length / peak) * 100)}%` : "2px",
                    }}
                  />
                  <span
                    className="nums absolute inset-x-0 text-center text-[11px] text-ink-700"
                    style={{
                      bottom: `calc(${b.rows.length ? Math.max(4, (b.rows.length / peak) * 100) : 0}% + 2px)`,
                    }}
                  >
                    {b.rows.length}
                  </span>
                </button>
                <span className="mt-1.5 text-center text-[11px] leading-tight text-text-subtle">{b.label}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

/** 6. Each company: offers with hires inside them, meet requests beside. */
function Companies({ board, employers, open }: { board: DriveBoard; employers: DriveEmployers; open: (p: Pop) => void }) {
  const rows = employers.rows;
  const max = Math.max(1, ...rows.map((r) => r.offers));
  const top = [...rows].filter((r) => r.employerId).sort((a, b) => b.hires - a.hires || b.offers - a.offers)[0];
  return (
    <Card title="Each company" note={top && top.offers ? `${top.company} hired the most` : plural(rows.filter((r) => r.employerId).length, "company came", "companies came")}>
      <Legend
        items={[
          { label: "Offers", tone: "bg-brand-400" },
          { label: "Hired", tone: "bg-brand-800" },
        ]}
      />
      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <BarRow
            key={r.key}
            label={r.employerId ? r.company : <span className="text-text-subtle">{r.company} · didn&apos;t come</span>}
            figure={
              r.employerId ? (
                <>
                  <span className="font-semibold">{n(r.offers)}</span> offers
                </>
              ) : (
                "—"
              )
            }
            sub={r.employerId ? `${n(r.hires)} hired · ${plural(r.meetings, "meet", "meets")}` : undefined}
            onClick={r.employerId ? () => open({ kind: "company", id: r.employerId! }) : undefined}
          >
            <Track value={r.offers} of={max} part={r.hires} tone="bg-brand-400" />
          </BarRow>
        ))}
      </ul>
      {board.offerCount === 0 ? <p className="mt-3 text-sm text-text-subtle">No company made an offer.</p> : null}
    </Card>
  );
}

/** 7. Nudges by kind: sent, and how many worked (the student did it within a day). */
function NudgeChart({ board, summary, open, listPop }: { board: DriveBoard; summary: DriveSummary; open: (p: Pop) => void; listPop: (k: BoardKey) => Pop }) {
  const worked = new Map(summary.nudges.byKind.map((k) => [k.kind, k]));
  const kinds: {
    key: BoardKey;
    label: string;
    sent: number;
    worked: number | null;
  }[] = [
    {
      key: "nudgedOnline",
      label: "Come online",
      sent: board.nudgeCounts.nudgedOnline,
      worked: worked.get("online")?.checkable ? worked.get("online")!.worked : null,
    },
    {
      key: "nudgedOpenToWork",
      label: "Turn on Open to work",
      sent: board.nudgeCounts.nudgedOpenToWork,
      worked: null,
    },
    {
      key: "nudgedMeet",
      label: "Answer a meet request",
      sent: board.nudgeCounts.nudgedMeet,
      worked: worked.get("meeting")?.checkable ? worked.get("meeting")!.worked : null,
    },
    {
      key: "nudgedOffer",
      label: "Reply to an offer",
      sent: board.nudgeCounts.nudgedOffer,
      worked: worked.get("offer")?.checkable ? worked.get("offer")!.worked : null,
    },
  ];
  const total = kinds.reduce((a, k) => a + k.sent, 0);
  const max = Math.max(1, ...kinds.map((k) => k.sent));
  const w = kinds.reduce((a, k) => a + (k.worked ?? 0), 0);
  return (
    <Card title="Did nudges work" note={total ? `${plural(total, "nudge", "nudges")} sent · ${n(w)} worked` : "No nudges were sent"}>
      <Legend
        items={[
          { label: "Sent", tone: "bg-brand-300" },
          { label: "Worked within a day", tone: "bg-brand-800" },
        ]}
      />
      <ul className="mt-3 space-y-1.5">
        {kinds.map((k) => (
          <BarRow
            key={k.key}
            label={k.label}
            figure={
              <>
                <span className="font-semibold">{n(k.sent)}</span> sent
              </>
            }
            sub={k.worked === null ? (k.sent ? "not tracked" : undefined) : `${n(k.worked)} worked`}
            onClick={k.sent ? () => open(listPop(k.key)) : undefined}
          >
            <Track value={k.sent} of={max} part={k.worked ?? 0} tone="bg-brand-300" />
          </BarRow>
        ))}
      </ul>
    </Card>
  );
}
