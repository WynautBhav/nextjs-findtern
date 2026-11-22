"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Mail, Phone, Search } from "lucide-react";

import { LinkedinIcon } from "@/components/ui/social-icons";

import { ONLINE_WINDOW_MS } from "@/lib/college/constants";
import { COHORTS, HIDDEN_REASONS, aiStatusLabel, ago, yearLabel } from "@/lib/college/labels";
import type { HiddenReason } from "@/lib/college/student-readiness";
import type { RosterListRow } from "@/lib/college/scope";
import { cn } from "@/lib/utils";
import { EmptyScene, Pill, SURFACE_CLASS } from "@/components/app/primitives";
import { CopyText } from "./copy-text";
import { Initials } from "./kit";
import { NudgeButton } from "./nudge-button";
import { RosterRemove } from "./roster-remove";
import type { StudentRow } from "./types";
import { STEPS, stepsReached, stuckAt, type Stuck, type TrackFacts } from "@/lib/college/placement-track";

/** Which students the page shows: your verified students (with their own filters), or names on your list. */
export type StudentGroup = "students" | "on_findtern" | "not_joined";
export type StudentFilter = "all" | "no_interview" | "interviewed" | "offered" | "offers" | "calls" | "hired" | "offline" | "hidden" | "not_open";
type Filter = StudentFilter;

/** "Everyone" is no chip at all: pressing the chip that is on clears it. */
const FILTERS: { id: Exclude<Filter, "all">; label: string }[] = [
  { id: "no_interview", label: "No interview" },
  // The dashboard's "AI interview done" and "Got an offer" figures open these (same rules as src/app/college/page.tsx).
  { id: "interviewed", label: "AI interview done" },
  { id: "offered", label: "Got an offer" },
  { id: "offers", label: "Offer waiting" },
  { id: "calls", label: "Calls not answered" },
  { id: "hired", label: "Hired" },
  { id: "hidden", label: "Hidden from employers" },
  { id: "not_open", label: "Not open to work" },
  { id: "offline", label: "Inactive 7+ days" },
];

const WEEK = 7 * 86400_000;
/** Cards rendered before "Show all": a 500-student college was a 1 MB page. */
const PAGE = 48;
const GRID = "grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3";
/** Verified students: one per line, read left to right (who, where they are stuck, contact, figures, the nudge). */
const ROWS = "grid gap-2 p-4 sm:p-5";
/** A row of pills: one line that scrolls sideways on a phone, wraps on wider screens. */
const ROW = "-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0";

/** A filter chip: 32px, outline at rest, near-black when on (the accent stays on data). */
function chipClass(on: boolean) {
  return cn(
    "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:h-8",
    on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:text-ink-900",
  );
}

function factsOf(s: StudentRow): TrackFacts {
  return { interviewed: aiStatusLabel(s.aiStatus).done, seen: !s.hiddenWhy, offers: s.proposals, hired: s.hired };
}

/** The stuck groups in the order a student moves through them; "done" (hired) last. */
const STAGES: { id: Stuck; label: string; tone: string }[] = [
  { id: "interview", label: "AI interview not done", tone: "bg-ink-300" },
  { id: "seen", label: "Interviewed, still hidden", tone: "bg-accent-500" },
  { id: "offer", label: "No offer yet", tone: "bg-ink-400" },
  { id: "hired", label: "Offer, not hired", tone: "bg-ink-600" },
  { id: "done", label: "Hired", tone: "bg-brand-600" },
];

function matches(s: StudentRow, f: Filter, now: number) {
  if (f === "no_interview") return !aiStatusLabel(s.aiStatus).done;
  if (f === "interviewed") return aiStatusLabel(s.aiStatus).done;
  if (f === "offered") return s.proposals > 0;
  if (f === "offers") return s.offersPending > 0;
  if (f === "calls") return s.callsPending > 0;
  if (f === "hired") return s.hired > 0;
  if (f === "hidden") return Boolean(s.hiddenWhy);
  if (f === "not_open") return !s.openToWork;
  if (f === "offline") return !s.lastActivityAt || now - new Date(s.lastActivityAt).getTime() >= WEEK;
  return true;
}

/**
 * Every student of the college in one place, as small cards: name, phone, email and whether they are online. The
 * Students group is the verified register (each card opens the student's page); the other two groups are the
 * college's own list: students already on Findtern who wait for the officer, and students who have not joined yet
 * (copy the invite or their emails to remind them, or take a name off the list). Adding students is on Approvals.
 */
export function StudentCards({
  students,
  roster,
  invite,
  now,
  initialGroup = "students",
  initialFilter = "all",
  initialWhy = null,
}: {
  students: StudentRow[];
  /** The college's list, only the names that are not verified students yet. */
  roster: RosterListRow[];
  /** The ready-to-send invite for students who have not joined. */
  invite: string;
  now: number;
  initialGroup?: StudentGroup;
  initialFilter?: StudentFilter;
  /** With the "hidden" filter: only students hidden for this reason (the dashboard's Hidden profiles links). */
  initialWhy?: HiddenReason | null;
}) {
  const [group, setGroup] = useState<StudentGroup>(initialGroup);
  const [cohort, setCohort] = useState<number | "all">("all");
  const [filter, setFilterState] = useState<Filter>(initialFilter);
  const [why, setWhy] = useState<HiddenReason | null>(initialWhy);
  const setFilter = (f: Filter) => { setFilterState(f); setWhy(null); };
  const [stage, setStage] = useState<Stuck | null>(null);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const waiting = useMemo(() => roster.filter((r) => r.state === "on_findtern"), [roster]);
  const notJoined = useMemo(() => roster.filter((r) => r.state === "not_joined"), [roster]);
  const term = q.trim().toLowerCase();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: students.length };
    for (const s of students) c[String(s.year)] = (c[String(s.year)] ?? 0) + 1;
    return c;
  }, [students]);

  const inYear = useMemo(() => students.filter((s) => cohort === "all" || s.year === cohort), [students, cohort]);
  const filterCounts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, inYear.filter((s) => matches(s, f.id, now)).length])) as Record<Filter, number>, [inYear, now]);
  const stageCounts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((g) => [g.id, 0])) as Record<Stuck, number>;
    for (const s of inYear) c[stuckAt(factsOf(s))]++;
    return c;
  }, [inYear]);
  const rows = useMemo(
    () =>
      inYear.filter((s) => {
        if (stage && stuckAt(factsOf(s)) !== stage) return false;
        if (!matches(s, filter, now)) return false;
        if (why && s.hidden !== why) return false;
        if (term && !`${s.name} ${s.rollNo ?? ""} ${s.branch ?? ""} ${s.email} ${s.phone ?? ""}`.toLowerCase().includes(term)) return false;
        return true;
      }),
    [inYear, stage, filter, why, term, now],
  );
  const listRows = useMemo(
    () => (group === "on_findtern" ? waiting : notJoined).filter((r) => !term || `${r.name} ${r.rollNo ?? ""} ${r.branch ?? ""} ${r.email} ${r.phone ?? ""}`.toLowerCase().includes(term)),
    [group, waiting, notJoined, term],
  );

  const total = group === "students" ? rows.length : listRows.length;
  const limit = showAll ? Infinity : PAGE;
  const chase: "interview" | "offer" | null = group !== "students" ? null : filter === "offers" ? "offer" : filter === "no_interview" || stage === "interview" ? "interview" : null;
  const chaseIds = chase ? rows.map((r) => r.userId) : [];
  const groups: { id: StudentGroup; label: string; n: number }[] = [
    { id: "students", label: "Verified students", n: students.length },
    { id: "on_findtern", label: "Waiting for you", n: waiting.length },
    { id: "not_joined", label: "Not joined yet", n: notJoined.length },
  ];

  // Year: one segmented track, as wide as its options. In the tab row on wide screens, above the chips otherwise.
  const yearTrack = (
    <div role="group" aria-label="Year" className="-mx-4 flex shrink-0 items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
                <span aria-hidden className="text-xs text-text-subtle">Year</span>
                <div className="inline-flex rounded-full bg-ink-100 p-1">
                  {[{ year: "all" as const, label: "All years", goal: "" }, ...COHORTS].map((c) => {
                    const on = cohort === c.year;
                    return (
                      <button
                        key={String(c.year)}
                        aria-pressed={on}
                        type="button"
                        title={c.goal || undefined}
                        onClick={() => setCohort(c.year)}
                        className={cn(
                          "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 sm:h-7",
                          on ? "bg-white text-ink-900 shadow-2xs" : "text-ink-600 hover:text-ink-900",
                        )}
                      >
                        <span aria-hidden>{c.year === "all" ? "All" : c.label.replace(/ year$/, "")}</span>
                        <span className="sr-only">{c.label}</span>
                        <span className="nums text-xs text-text-subtle">{counts[String(c.year)] ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
  );

  return (
    <section aria-label="Students" className={cn("overflow-hidden", SURFACE_CLASS)}>
      <header className="border-b border-ink-100">
        {/* Which list: underline tabs on one rule, search at the right end. */}
        <div className="flex flex-col-reverse gap-3 px-4 pt-3 sm:flex-row sm:items-end sm:justify-between sm:px-5 sm:pt-4">
          <div role="group" aria-label="Which students" className="-mb-px flex min-w-0 gap-4 overflow-x-auto [scrollbar-width:none] min-[1380px]:shrink-0">
            {groups.map((g) => {
              const on = group === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { setGroup(g.id); setShowAll(false); }}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                    on ? "border-ink-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900",
                  )}
                >
                  {g.label}
                  <span className={cn("nums text-xs", on ? "text-ink-700" : "text-text-subtle")}>{g.n}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 sm:mb-2.5">
          {group === "students" ? <div className="hidden min-[1380px]:block">{yearTrack}</div> : null}
          <label className="relative w-full shrink-0 sm:w-48 xl:w-56">
            <span className="sr-only">Search students</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, roll no., phone"
              className="h-11 w-full rounded-full border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:h-9"
            />
          </label>
          </div>
        </div>
      </header>

      {group === "students" ? (
        <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3 sm:px-5 min-[1380px]:flex-row min-[1380px]:items-center">
          <div className="min-[1380px]:hidden">{yearTrack}</div>
          <div role="group" aria-label="Show only" className={cn(ROW, "min-w-0 flex-1")}>
            {FILTERS.filter((f) => f.id === "offers" || (f.id === "calls" && filterCounts.calls > 0) || f.id === "hidden" || f.id === "not_open" || f.id === "offline" || f.id === filter).map((f) => {
              const on = filter === f.id;
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => setFilter(on ? "all" : f.id)} className={chipClass(on)}>
                  {on && why && f.id === "hidden" ? HIDDEN_REASONS.find((h) => h.id === why)?.label : f.label}
                  <span className={cn("nums text-xs", on ? "text-white/70" : "text-text-subtle")}>{on && why && f.id === "hidden" ? inYear.filter((s) => s.hidden === why).length : filterCounts[f.id]}</span>
                </button>
              );
            })}
          </div>
          {chaseIds.length > 0 ? (
            <span className="shrink-0">
              <NudgeButton key={`${filter}-${stage}-${cohort}-${chaseIds.length}`} kind={chase ?? "interview"} userIds={chaseIds} label={`Nudge these ${chaseIds.length}`} />
            </span>
          ) : null}
        </div>
      ) : group === "not_joined" ? (
        notJoined.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3 sm:px-5">
            <p className="mr-auto text-sm text-text-subtle">On your list, no Findtern account yet. Send them the invite.</p>
            <CopyText text={invite} label="Copy invite message" />
            <CopyText text={notJoined.map((s) => s.email).join(", ")} label={`Copy ${notJoined.length} emails`} />
          </div>
        ) : null
      ) : waiting.length > 0 ? (
        <p className="border-b border-ink-100 px-4 py-3 text-sm text-text-subtle sm:px-5">
          These students already have a Findtern account.{" "}
          <Link href="/college/approvals" className="font-medium text-brand-700 underline underline-offset-2">Accept them on Approvals</Link>
        </p>
      ) : null}

      {group === "students" && inYear.length > 0 ? <StuckBar counts={stageCounts} total={inYear.length} value={stage} onChange={(v) => { setStage(v); setShowAll(false); }} /> : null}

      {total === 0 ? (
        <EmptyCards group={group} anyAtAll={group === "students" ? students.length > 0 : (group === "on_findtern" ? waiting : notJoined).length > 0} />
      ) : group === "students" ? (
        <ul className={ROWS}>
          {rows.slice(0, limit).map((s) => (
            <li key={s.userId} className="min-w-0">
              <StudentCard s={s} now={now} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className={GRID}>
          {listRows.slice(0, limit).map((r) => (
            <li key={r.email} className="min-w-0">
              <ListCard r={r} />
            </li>
          ))}
        </ul>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-5 py-3 text-xs text-text-subtle">
        <span>
          Showing <span className="nums">{Math.min(total, limit)}</span> of <span className="nums">{total}</span>
        </span>
        {total > limit ? (
          <button type="button" onClick={() => setShowAll(true)} className="inline-flex min-h-11 items-center rounded-apple-sm px-3 text-sm font-medium text-brand-700 hover:bg-brand-50">
            Show all {total}
          </button>
        ) : null}
      </footer>
    </section>
  );
}

function EmptyCards({ group, anyAtAll }: { group: StudentGroup; anyAtAll: boolean }) {
  if (anyAtAll) return <EmptyScene compact title="No students match" body="Nobody fits this search or these filters. Clear them to see everyone." />;
  if (group === "students")
    return <EmptyScene compact title="No verified students yet" body="Students appear here once they join with your college code, or once you accept them on Approvals." next={{ label: "Add students", href: "/college/approvals#add" }} />;
  if (group === "on_findtern") return <EmptyScene compact title="Nobody waiting" body="No student on your list is waiting for you to accept them." />;
  return <EmptyScene compact title="Everyone has joined" body="Every student on your list has a Findtern account. Add more students on Approvals." next={{ label: "Add students", href: "/college/approvals#add" }} />;
}

function Online({ at, now }: { at: string | null; now: number }) {
  const on = at && now - new Date(at).getTime() < ONLINE_WINDOW_MS;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
      <span className={cn("size-2 rounded-full", on ? "bg-brand-600" : "bg-ink-300")} aria-hidden />
      <span className={on ? "font-medium text-brand-800" : "text-ink-600"}>{on ? "Online" : ago(at, now)}</span>
    </span>
  );
}

/** Phone and email as their own links, above the card's stretched link so each can be pressed. */
function ContactLines({ phone, email, linkedin, name }: { phone: string | null; email: string; linkedin?: string | null; name: string }) {
  return (
    <div className="relative z-10 space-y-1 px-4 py-3 text-sm">
      {phone ? (
        <a href={`tel:${phone.replace(/\s/g, "")}`} className="nums flex w-fit items-center gap-2 text-ink-800 hover:text-brand-700 hover:underline">
          <Phone className="size-3.5 shrink-0 text-ink-500" aria-hidden />
          {phone}
        </a>
      ) : (
        <span className="flex items-center gap-2 text-text-subtle">
          <Phone className="size-3.5 shrink-0 text-ink-400" aria-hidden />
          No phone
        </span>
      )}
      <span className="flex min-w-0 items-center gap-2">
        <Mail className="size-3.5 shrink-0 text-ink-500" aria-hidden />
        <a href={`mailto:${email}`} className="min-w-0 truncate text-ink-700 hover:text-brand-700 hover:underline" title={email}>{email}</a>
        {linkedin ? (
          <a href={linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${name} on LinkedIn (opens in a new tab)`} className="ml-auto shrink-0 text-ink-500 hover:text-brand-700">
            <LinkedinIcon className="size-3.5" />
          </a>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Where the batch stands, as one bar: every student sits in exactly one group (the first step they have not reached),
 * so the groups add up to the list. Each group is a button that narrows the cards to those students; press it again
 * to see everyone. Hired is the only green on the bar, and the one amber is the group employers cannot see.
 */
function StuckBar({ counts, total, value, onChange }: { counts: Record<Stuck, number>; total: number; value: Stuck | null; onChange: (v: Stuck | null) => void }) {
  return (
    <div className="border-b border-ink-100 px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-900">Where your students are stuck</h3>
        <p className="nums text-xs text-text-subtle">{total} students</p>
      </div>
      <div aria-hidden className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {STAGES.map((g) =>
          counts[g.id] > 0 ? (
            <span
              key={g.id}
              className={cn("h-full transition-[width,opacity] duration-300 motion-reduce:transition-none", g.tone, value && value !== g.id && "opacity-25")}
              style={{ width: `${(counts[g.id] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div role="group" aria-label="Stuck at" className="-mx-4 mt-2 flex overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0 sm:-mx-1">
        {STAGES.map((g) => {
          const on = value === g.id;
          const n = counts[g.id];
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              disabled={n === 0 && !on}
              onClick={() => onChange(on ? null : g.id)}
              className={cn(
                "group/stage m-1 min-w-36 shrink-0 rounded-lg border px-3 py-2 text-left sm:min-w-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-default",
                on ? "border-ink-900 bg-ink-50" : "border-transparent hover:bg-ink-50 disabled:hover:bg-transparent",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs text-ink-600">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", g.tone)} />
                <span className="truncate">{g.label}</span>
              </span>
              <span className="mt-0.5 flex items-baseline gap-1.5">
                <span className={cn("nums text-xl font-medium tracking-[-0.02em]", n ? "text-ink-900" : "text-ink-400")}>{n}</span>
                <span className="nums text-xs text-text-subtle">{total ? Math.round((n / total) * 100) : 0}%</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The six steps as six short segments: reached in ink, the step they are stuck at marked, the rest grey. */
function Track({ s, className }: { s: StudentRow; className?: string }) {
  const facts = factsOf(s);
  const reached = stepsReached(facts);
  const stuck = stuckAt(facts);
  const ai = aiStatusLabel(s.aiStatus);
  const why =
    stuck === "done" ? null
    : stuck === "interview" ? ai.label
    : stuck === "seen" ? s.hiddenWhy
    : stuck === "offer" ? "Employers can see them"
    : `${s.offersPending ? `${s.offersPending} waiting on their reply` : "Offer given"}`;
  const label = stuck === "done" ? "Hired" : STAGES.find((g) => g.id === stuck)!.label;
  return (
    <div className={className}>
      <div aria-hidden className="flex max-w-md gap-1">
        {STEPS.map((step, i) => (
          <span
            key={step.id}
            title={step.label}
            className={cn("h-1 flex-1 rounded-full", stuck === "done" ? "bg-brand-600" : i < reached ? "bg-ink-800" : i === reached ? (stuck === "seen" ? "bg-accent-500" : "bg-ink-400") : "bg-ink-100")}
          />
        ))}
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs leading-4">
        <span className={cn("font-medium", stuck === "done" ? "text-brand-800" : "text-ink-900")}>{label}</span>
        {why ? <span className="text-text-subtle"> · {why}</span> : null}
        {/* The hire gate: an unfinished profile only matters once an employer wants them. */}
        {stuck !== "done" && s.hireWhy ? <span className="text-text-subtle"> · {s.hireWhy.replace(/^Profile incomplete: (.*) is not finished\.$/, "$1 not finished").replace(/\.$/, "")}</span> : null}
        <span className="sr-only">, {reached} of {STEPS.length} steps</span>
      </p>
    </div>
  );
}

function StudentCard({ s, now }: { s: StudentRow; now: number }) {
  const ai = aiStatusLabel(s.aiStatus);
  const name = s.name || s.email;
  const scored = ai.done && s.score !== null;
  return (
    // The whole row opens the student: the name's link is stretched over it. A stacked card on a phone, one line wide.
    <article className="group relative flex flex-col rounded-lg border border-ink-200/80 bg-white transition-colors hover:border-ink-400 has-[a:focus-visible]:border-brand-500 lg:grid lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,14rem)_auto] lg:items-center lg:gap-6 lg:px-4 lg:py-3">
      <div className="flex items-start gap-3 px-4 pt-4 lg:items-center lg:p-0">
        <Initials seed={s.userId} name={name} className="size-10" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/college/students/${s.userId}`}
            className="block truncate font-semibold tracking-[-0.01em] text-ink-900 outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
          >
            {name}
          </Link>
          <p className="truncate text-xs text-text-subtle">{[s.rollNo, yearLabel(s.year), s.branch].filter((v) => v && v !== "—").join(" · ") || "Year not set"}</p>
          <span className="mt-0.5 hidden lg:block">
            <Online at={s.lastSeenAt ?? s.lastActivityAt} now={now} />
          </span>
        </div>
        <span className="lg:hidden">
          <Online at={s.lastSeenAt ?? s.lastActivityAt} now={now} />
        </span>
      </div>

      <Track s={s} className="px-4 pt-3 lg:p-0" />

      <div className="lg:[&>div]:p-0">
        <ContactLines phone={s.phone} email={s.email} linkedin={s.linkedin} name={name} />
      </div>

      {/* The two numbers employers filter on, as figures; then what is waiting on the student. */}
      <div className="mt-auto flex items-end gap-5 border-t border-ink-100 px-4 py-3 lg:mt-0 lg:w-[14rem] lg:gap-4 lg:border-0 lg:p-0">
        <div>
          <p className="whitespace-nowrap text-xs text-text-subtle">Findtern score</p>
          <p className={cn("nums text-lg font-medium leading-tight", scored ? "text-ink-900" : "text-ink-400")}>{scored ? s.score!.toFixed(1) : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-text-subtle">CGPA</p>
          <p className={cn("nums text-lg font-medium leading-tight", s.cgpa !== null ? "text-ink-900" : "text-ink-400")}>{s.cgpa?.toFixed(1) ?? "—"}</p>
        </div>
        {s.offersPending > 0 ? (
          <span className="relative z-10 ml-auto">
            <NudgeButton kind="offer" userIds={[s.userId]} size="xs" className="min-h-8 whitespace-nowrap" />
          </span>
        ) : null}
      </div>
    </article>
  );
}

/** A name on the college's own list that is not a verified student yet: no profile to open. */
function ListCard({ r }: { r: RosterListRow }) {
  const name = r.name || r.email;
  return (
    <article className="flex h-full flex-col rounded-apple-md border border-ink-200/80 bg-white p-4">
      <div className="flex items-start gap-3">
        <Initials seed={r.email} name={name} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink-900">{name}</p>
          <p className="truncate text-xs text-text-subtle">{[r.rollNo, r.year ? yearLabel(r.year) : null, r.branch].filter(Boolean).join(" · ") || "On your list"}</p>
        </div>
        <Pill tone={r.state === "on_findtern" ? "waiting" : "closed"}>{r.state === "on_findtern" ? "Waiting for you" : "Not joined"}</Pill>
      </div>
      <div className="-mx-4"><ContactLines phone={r.phone} email={r.email} name={name} /></div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-ink-100 pt-2">
        {r.state === "on_findtern" ? (
          <Link href="/college/approvals" className="inline-flex min-h-9 items-center text-sm font-medium text-brand-700 hover:underline">Accept on Approvals</Link>
        ) : (
          <span className="text-xs text-text-subtle">Invite not answered</span>
        )}
        <RosterRemove email={r.email} name={r.name} />
      </div>
    </article>
  );
}
