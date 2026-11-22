"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Mail, Phone, Search } from "lucide-react";

import { LinkedinIcon } from "@/components/ui/social-icons";

import { ONLINE_WINDOW_MS } from "@/lib/college/constants";
import { COHORTS, aiStatusLabel, ago, yearLabel } from "@/lib/college/labels";
import type { RosterListRow } from "@/lib/college/scope";
import { cn } from "@/lib/utils";
import { EmptyScene, Pill, SURFACE_CLASS } from "@/components/app/primitives";
import { CopyText } from "./copy-text";
import { Initials } from "./kit";
import { NudgeButton } from "./nudge-button";
import { RosterRemove } from "./roster-remove";
import type { StudentRow } from "./types";

/** Which students the page shows: your verified students (with their own filters), or names on your list. */
export type StudentGroup = "students" | "on_findtern" | "not_joined";
export type StudentFilter = "all" | "no_interview" | "offers" | "hired" | "offline" | "hidden";
type Filter = StudentFilter;

/** "Everyone" is no chip at all: pressing the chip that is on clears it. */
const FILTERS: { id: Exclude<Filter, "all">; label: string }[] = [
  { id: "no_interview", label: "No interview" },
  { id: "offers", label: "Offer waiting" },
  { id: "hired", label: "Hired" },
  { id: "hidden", label: "Hidden from employers" },
  { id: "offline", label: "Inactive 7+ days" },
];

const WEEK = 7 * 86400_000;
/** Cards rendered before "Show all": a 500-student college was a 1 MB page. */
const PAGE = 48;
const GRID = "grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3";
/** A row of pills: one line that scrolls sideways on a phone, wraps on wider screens. */
const ROW = "-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0";

/** A filter chip: 32px, outline at rest, near-black when on (the accent stays on data). */
function chipClass(on: boolean) {
  return cn(
    "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:h-8",
    on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:text-ink-900",
  );
}

function matches(s: StudentRow, f: Filter, now: number) {
  if (f === "no_interview") return !aiStatusLabel(s.aiStatus).done;
  if (f === "offers") return s.offersPending > 0;
  if (f === "hired") return s.hired > 0;
  if (f === "hidden") return Boolean(s.hiddenWhy);
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
}: {
  students: StudentRow[];
  /** The college's list, only the names that are not verified students yet. */
  roster: RosterListRow[];
  /** The ready-to-send invite for students who have not joined. */
  invite: string;
  now: number;
  initialGroup?: StudentGroup;
  initialFilter?: StudentFilter;
}) {
  const [group, setGroup] = useState<StudentGroup>(initialGroup);
  const [cohort, setCohort] = useState<number | "all">("all");
  const [filter, setFilter] = useState<Filter>(initialFilter);
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
  const rows = useMemo(
    () =>
      inYear.filter((s) => {
        if (!matches(s, filter, now)) return false;
        if (term && !`${s.name} ${s.rollNo ?? ""} ${s.branch ?? ""} ${s.email} ${s.phone ?? ""}`.toLowerCase().includes(term)) return false;
        return true;
      }),
    [inYear, filter, term, now],
  );
  const listRows = useMemo(
    () => (group === "on_findtern" ? waiting : notJoined).filter((r) => !term || `${r.name} ${r.rollNo ?? ""} ${r.branch ?? ""} ${r.email} ${r.phone ?? ""}`.toLowerCase().includes(term)),
    [group, waiting, notJoined, term],
  );

  const total = group === "students" ? rows.length : listRows.length;
  const limit = showAll ? Infinity : PAGE;
  const chaseIds = group === "students" && (filter === "no_interview" || filter === "offers") ? rows.map((r) => r.userId) : [];
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
                    on ? "border-brand-700 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900",
                  )}
                >
                  {g.label}
                  <span className={cn("nums rounded-full px-1.5 text-xs", on ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-600")}>{g.n}</span>
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
            {FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => setFilter(on ? "all" : f.id)} className={chipClass(on)}>
                  {f.id === "hidden" ? <span aria-hidden className={cn("size-1.5 rounded-full", on ? "bg-white" : "bg-accent-500")} /> : null}
                  {f.label}
                  <span className={cn("nums text-xs", on ? "text-white/70" : "text-text-subtle")}>{filterCounts[f.id]}</span>
                </button>
              );
            })}
          </div>
          {chaseIds.length > 0 ? (
            <span className="shrink-0">
              <NudgeButton key={`${filter}-${cohort}-${chaseIds.length}`} kind={filter === "offers" ? "offer" : "interview"} userIds={chaseIds} label={`Nudge these ${chaseIds.length}`} />
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

      {total === 0 ? (
        <EmptyCards group={group} anyAtAll={group === "students" ? students.length > 0 : (group === "on_findtern" ? waiting : notJoined).length > 0} />
      ) : group === "students" ? (
        <ul className={GRID}>
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

function StudentCard({ s, now }: { s: StudentRow; now: number }) {
  const ai = aiStatusLabel(s.aiStatus);
  const name = s.name || s.email;
  const scored = ai.done && s.score !== null;
  // Hidden outranks "can't be hired": a student employers can't find has the bigger problem.
  const flag = s.hiddenWhy ? { title: "Hidden from employers", why: s.hiddenWhy } : s.hireWhy ? { title: "Can't be hired yet", why: s.hireWhy } : null;
  return (
    // The whole card opens the student: the name's link is stretched over it.
    <article className="group relative flex h-full flex-col rounded-apple-md border border-ink-200/80 bg-white transition-colors hover:border-brand-300 has-[a:focus-visible]:border-brand-500">
      <div className="flex items-start gap-3 px-4 pt-4">
        <Initials seed={s.userId} name={name} className="size-10" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/college/students/${s.userId}`}
            className="block truncate font-semibold tracking-[-0.01em] text-ink-900 outline-none after:absolute after:inset-0 after:rounded-apple-md after:content-[''] group-hover:text-brand-800 focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
          >
            {name}
          </Link>
          <p className="truncate text-xs text-text-subtle">{[s.rollNo, yearLabel(s.year), s.branch].filter((v) => v && v !== "—").join(" · ") || "Year not set"}</p>
        </div>
        <Online at={s.lastSeenAt ?? s.lastActivityAt} now={now} />
      </div>

      <ContactLines phone={s.phone} email={s.email} linkedin={s.linkedin} name={name} />

      {/* The two numbers employers filter on, as figures; then what is waiting. */}
      <div className="mt-auto flex items-end gap-4 px-4 pb-3">
        <div>
          <p className="whitespace-nowrap text-xs text-text-subtle">Findtern score</p>
          <p className={cn("nums text-lg font-semibold leading-tight", scored ? "text-ink-900" : "text-ink-400")}>{scored ? s.score!.toFixed(1) : <span className="text-sm font-medium">{ai.label}</span>}</p>
        </div>
        <div>
          <p className="text-xs text-text-subtle">CGPA</p>
          <p className={cn("nums text-lg font-semibold leading-tight", s.cgpa !== null ? "text-ink-900" : "text-ink-400")}>{s.cgpa?.toFixed(1) ?? "—"}</p>
        </div>
        {s.offersPending > 0 ? (
          <span className="relative z-10 ml-auto inline-flex items-center gap-1.5">
            <Pill tone="waiting" className="nums whitespace-nowrap">{s.offersPending} {s.offersPending === 1 ? "offer" : "offers"}</Pill>
            <NudgeButton kind="offer" userIds={[s.userId]} size="xs" className="min-h-8" />
          </span>
        ) : s.hired > 0 ? (
          <span className="ml-auto"><Pill tone="paid">Hired</Pill></span>
        ) : null}
      </div>

      {flag ? (
        <p className="flex items-start gap-2 rounded-b-apple-md border-t border-accent-300/60 bg-accent-100/70 px-4 py-2 text-xs leading-4 text-ink-800">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-500" />
          <span className="min-w-0">
            <span className="font-semibold">{flag.title}.</span> {flag.why}
          </span>
        </p>
      ) : null}
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
