"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Mail, Phone, Search } from "lucide-react";

import { LinkedinIcon } from "@/components/ui/social-icons";

import { ONLINE_WINDOW_MS } from "@/lib/college/constants";
import { COHORTS, aiStatusLabel, ago, yearLabel } from "@/lib/college/labels";
import type { RosterListRow } from "@/lib/college/scope";
import { cn } from "@/lib/utils";
import { EmptyScene, Pill, SURFACE_CLASS, pillTabClass } from "@/components/app/primitives";
import { CopyText } from "./copy-text";
import { Initials } from "./kit";
import { NudgeButton } from "./nudge-button";
import { RosterRemove } from "./roster-remove";
import type { StudentRow } from "./types";

/** Which students the page shows: your verified students (with their own filters), or names on your list. */
export type StudentGroup = "students" | "on_findtern" | "not_joined";
export type StudentFilter = "all" | "no_interview" | "offers" | "hired" | "offline";
type Filter = StudentFilter;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "no_interview", label: "Interview not done" },
  { id: "offers", label: "Offer waiting on reply" },
  { id: "hired", label: "Hired" },
  { id: "offline", label: "Inactive 7+ days" },
];

const WEEK = 7 * 86400_000;
/** Cards rendered before "Show all": a 500-student college was a 1 MB page. */
const PAGE = 48;
const GRID = "grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3";
/** A row of pills: one line that scrolls sideways on a phone, wraps on wider screens. */
const ROW = "-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0";

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

  const rows = useMemo(
    () =>
      students.filter((s) => {
        if (cohort !== "all" && s.year !== cohort) return false;
        if (filter === "no_interview" && aiStatusLabel(s.aiStatus).done) return false;
        if (filter === "offers" && s.offersPending === 0) return false;
        if (filter === "hired" && s.hired === 0) return false;
        if (filter === "offline" && s.lastActivityAt && now - new Date(s.lastActivityAt).getTime() < WEEK) return false;
        if (term && !`${s.name} ${s.rollNo ?? ""} ${s.branch ?? ""} ${s.email} ${s.phone ?? ""}`.toLowerCase().includes(term)) return false;
        return true;
      }),
    [students, cohort, filter, term, now],
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

  return (
    <section aria-label="Students" className={cn("overflow-hidden", SURFACE_CLASS)}>
      <header className="flex flex-col gap-4 border-b border-ink-100 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Which students" className={ROW}>
            {groups.map((g) => (
              <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => { setGroup(g.id); setShowAll(false); }} className={pillTabClass(group === g.id)}>
                {g.label}
                <span className={cn("nums text-xs", group === g.id ? "text-white/75" : "text-text-subtle")}>{g.n}</span>
              </button>
            ))}
          </div>
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search students</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, roll no., phone"
              className="h-11 w-full rounded-apple-sm border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
        </div>

        {group === "students" ? (
          <>
            <div role="group" aria-label="Year" className={ROW}>
              {[{ year: "all" as const, label: "All years", goal: "" }, ...COHORTS].map((c) => {
                const active = cohort === c.year;
                return (
                  <button key={String(c.year)} aria-pressed={active} type="button" title={c.goal || undefined} onClick={() => setCohort(c.year)} className={pillTabClass(active)}>
                    {c.label}
                    <span className={cn("nums text-xs", active ? "text-white/75" : "text-text-subtle")}>{counts[String(c.year)] ?? 0}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Filter" className={cn(ROW, "min-w-0 flex-1")}>
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={pillTabClass(filter === f.id)}>
                  {f.label}
                </button>
              ))}
              </div>
              {chaseIds.length > 0 ? (
                <span className="shrink-0">
                  <NudgeButton key={`${filter}-${cohort}-${chaseIds.length}`} kind={filter === "offers" ? "offer" : "interview"} userIds={chaseIds} label={`Nudge these ${chaseIds.length}`} />
                </span>
              ) : null}
            </div>
          </>
        ) : group === "not_joined" ? (
          notJoined.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto text-sm text-text-subtle">On your list, no Findtern account yet. Send them the invite.</p>
              <CopyText text={invite} label="Copy invite message" />
              <CopyText text={notJoined.map((s) => s.email).join(", ")} label={`Copy ${notJoined.length} emails`} />
            </div>
          ) : null
        ) : waiting.length > 0 ? (
          <p className="text-sm text-text-subtle">
            These students already have a Findtern account.{" "}
            <Link href="/college/approvals" className="font-medium text-brand-700 underline underline-offset-2">Accept them on Approvals</Link>
          </p>
        ) : null}
      </header>

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
    <div className="relative z-10 mb-3 mt-3 space-y-1 text-sm">
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
  return (
    // The whole card opens the student: the name's link is stretched over it.
    <article className="group relative flex h-full flex-col rounded-apple-md border border-ink-200/80 bg-white p-4 transition-colors hover:border-brand-300 has-[a:focus-visible]:border-brand-500">
      <div className="flex items-start gap-3">
        <Initials seed={s.userId} name={name} className="size-10" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/college/students/${s.userId}`}
            className="block truncate font-medium text-ink-900 outline-none after:absolute after:inset-0 after:rounded-apple-md after:content-[''] group-hover:text-brand-800 focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
          >
            {name}
          </Link>
          <p className="truncate text-xs text-text-subtle">{[s.rollNo, yearLabel(s.year), s.branch].filter((v) => v && v !== "—").join(" · ") || "Year not set"}</p>
        </div>
        <Online at={s.lastSeenAt ?? s.lastActivityAt} now={now} />
      </div>
      <ContactLines phone={s.phone} email={s.email} linkedin={s.linkedin} name={name} />
      <div className="mt-auto flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-100 pt-3 text-xs text-text-subtle">
        {ai.done && s.score !== null ? (
          <span title="Findtern score">
            Score <span className="nums text-sm font-semibold text-ink-900">{s.score.toFixed(1)}</span>
          </span>
        ) : (
          <span>{ai.label}</span>
        )}
        <span>
          CGPA <span className="nums text-sm font-semibold text-ink-900">{s.cgpa?.toFixed(1) ?? "—"}</span>
        </span>
        {s.offersPending > 0 ? (
          <span className="relative z-10 ml-auto inline-flex items-center gap-1.5">
            <Pill tone="waiting" className="nums">{s.offersPending} {s.offersPending === 1 ? "offer" : "offers"}</Pill>
            <NudgeButton kind="offer" userIds={[s.userId]} size="xs" className="min-h-8" />
          </span>
        ) : s.hired > 0 ? (
          <span className="ml-auto"><Pill tone="paid">Hired</Pill></span>
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
      <ContactLines phone={r.phone} email={r.email} name={name} />
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
