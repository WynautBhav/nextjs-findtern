"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { LinkedinIcon } from "@/components/ui/social-icons";

import { ONLINE_WINDOW_MS } from "@/lib/college/constants";
import { COHORTS, aiStatusLabel, ago, yearLabel } from "@/lib/college/labels";
import { cn } from "@/lib/utils";
import { EmptyScene, Pill, SURFACE_CLASS, pillTabClass } from "@/components/app/primitives";
import { NudgeButton } from "./nudge-button";
import type { StudentRow } from "./types";

export type StudentFilter = "all" | "no_interview" | "offers" | "offline";
type Filter = StudentFilter;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "no_interview", label: "Interview not done" },
  { id: "offers", label: "Offer waiting on reply" },
  { id: "offline", label: "Inactive 7+ days" },
];

const WEEK = 7 * 86400_000;
/** Rows rendered before "Show all": a 500-student college was a 1 MB page. */
const PAGE = 50;

export function StudentTable({ students, now, initialFilter = "all" }: { students: StudentRow[]; now: number; initialFilter?: StudentFilter }) {
  const [cohort, setCohort] = useState<number | "all">("all");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: students.length };
    for (const s of students) c[String(s.year)] = (c[String(s.year)] ?? 0) + 1;
    return c;
  }, [students]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return students.filter((s) => {
      if (cohort !== "all" && s.year !== cohort) return false;
      if (filter === "no_interview" && aiStatusLabel(s.aiStatus).done) return false;
      if (filter === "offers" && s.offersPending === 0) return false;
      if (filter === "offline" && s.lastActivityAt && now - new Date(s.lastActivityAt).getTime() < WEEK) return false;
      if (term && !`${s.name} ${s.rollNo ?? ""} ${s.branch ?? ""} ${s.email} ${s.phone ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [students, cohort, filter, q, now]);

  const shown = showAll ? rows : rows.slice(0, PAGE);

  const chaseIds =
    filter === "no_interview" ? rows.map((r) => r.userId) : filter === "offers" ? rows.map((r) => r.userId) : [];

  return (
    <section aria-labelledby="students-heading" className={cn("overflow-hidden", SURFACE_CLASS)}>
      <header className="flex flex-col gap-4 border-b border-ink-100 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="students-heading" className="text-lg font-semibold tracking-[-0.02em] text-ink-900">
              <span className="nums">{students.length}</span> verified {students.length === 1 ? "student" : "students"}
            </h2>
            <p className="mt-0.5 text-sm text-text-subtle">
              Open a student for the full profile, AI interview report and recording.
            </p>
          </div>
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search students</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, roll number, phone, email"
              className="h-11 w-full rounded-apple-sm border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
        </div>

        {/* The console's one pill-tab look, one line each (the cohort goal
            under every tab made it two lines tall). They filter one list,
            so they're pressed buttons, not tabs. */}
        <div role="group" aria-label="Cohort" className="flex flex-wrap gap-1">
          {[{ year: "all" as const, label: "All years", goal: "" }, ...COHORTS].map((c) => {
            const active = cohort === c.year;
            const n = counts[String(c.year)] ?? 0;
            return (
              <button
                key={String(c.year)}
                aria-pressed={active}
                type="button"
                title={c.goal || undefined}
                onClick={() => setCohort(c.year)}
                className={pillTabClass(active)}
              >
                {c.label}
                <span className={cn("nums text-xs", active ? "text-white/75" : "text-text-subtle")}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={pillTabClass(filter === f.id)}
            >
              {f.label}
            </button>
          ))}
          {chaseIds.length > 0 ? (
            <span className="ml-auto">
              <NudgeButton
                key={`${filter}-${cohort}-${chaseIds.length}`}
                kind={filter === "offers" ? "offer" : "interview"}
                userIds={chaseIds}
                label={`Nudge these ${chaseIds.length}`}
              />
            </span>
          ) : null}
        </div>
      </header>

      {rows.length === 0 ? (
        students.length === 0 ? (
          <EmptyScene
            compact
            title="No verified students yet"
            body="Students appear here once they join with your college code, or once you accept them on the Approvals page."
            next={{ label: "Add your student list", href: "/college/roster" }}
          />
        ) : (
          <EmptyScene
            compact
            title="No students match"
            body="No student fits these filters. Clear a filter or the search to see everyone."
          />
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Students, {rows.length} shown</caption>
              <thead className="border-b border-ink-100 bg-ink-50/60 text-sm font-semibold text-ink-700">
                <tr>
                  <th scope="col" className="px-5 py-2.5">Student</th>
                  <th scope="col" className="px-3 py-2.5">Contact</th>
                  <th scope="col" className="px-3 py-2.5">AI interview</th>
                  <th scope="col" className="px-3 py-2.5 text-right">CGPA</th>
                  <th scope="col" className="px-3 py-2.5">Last active</th>
                  <th scope="col" className="px-3 py-2.5">Offers</th>
                  <th scope="col" className="px-5 py-2.5">Meetings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {shown.map((s) => (
                  <Row key={s.userId} s={s} now={now} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="divide-y divide-ink-100 md:hidden">
            {shown.map((s) => (
              <li key={s.userId} className="px-4 py-3.5">
                <MobileRow s={s} now={now} />
              </li>
            ))}
          </ul>
        </>
      )}
      {rows.length > shown.length ? (
        <div className="border-t border-ink-100 px-5 py-3">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex min-h-11 items-center rounded-apple-sm px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Show all {rows.length}
          </button>
        </div>
      ) : null}
      <p className="border-t border-ink-100 px-5 py-3 text-xs text-text-subtle">
        Showing <span className="nums">{shown.length}</span> of <span className="nums">{students.length}</span>.
      </p>
    </section>
  );
}

function Online({ at, now }: { at: string | null; now: number }) {
  const on = at && now - new Date(at).getTime() < ONLINE_WINDOW_MS;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", on ? "bg-brand-600" : "bg-ink-300")} aria-hidden />
      <span className={on ? "font-medium text-brand-800" : "text-ink-600"}>{on ? "Online" : ago(at, now)}</span>
    </span>
  );
}

function Ai({ s }: { s: StudentRow }) {
  const st = aiStatusLabel(s.aiStatus);
  if (st.done && s.score !== null) {
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <span className="nums text-[0.9375rem] font-semibold text-ink-900">{s.score.toFixed(1)}</span>
        <span className="text-xs text-text-subtle">/ 10</span>
      </span>
    );
  }
  return <span className="text-ink-600">{st.label}</span>;
}

/** Phone, email and LinkedIn. Links sit above the row's stretched link so they can be pressed on their own. */
function Contact({ s }: { s: StudentRow }) {
  return (
    <div className="relative z-10 min-w-0 text-sm">
      {s.phone ? (
        <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="nums block font-medium text-ink-800 hover:text-brand-700 hover:underline">{s.phone}</a>
      ) : null}
      <span className="flex items-center gap-2">
        <a href={`mailto:${s.email}`} className="block max-w-[15rem] truncate text-xs text-ink-600 hover:text-brand-700 hover:underline" title={s.email}>{s.email}</a>
        {s.linkedin ? (
          <a href={s.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${s.name || "Student"} on LinkedIn (opens in a new tab)`} className="shrink-0 text-ink-500 hover:text-brand-700">
            <LinkedinIcon className="size-3.5" />
          </a>
        ) : null}
      </span>
    </div>
  );
}

function Row({ s, now }: { s: StudentRow; now: number }) {
  return (
    // The row opens the student: the name's link is stretched over it.
    <tr className="relative hover:bg-ink-50/60">
      <td className="px-5 py-3">
        <Link
          href={`/college/students/${s.userId}`}
          className="font-medium text-ink-900 outline-none touch:inline-flex touch:min-h-11 touch:items-center after:absolute after:inset-0 after:content-[''] hover:text-brand-700 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
        >
          {s.name || s.email}
        </Link>
        <p className="mt-0.5 text-xs text-text-subtle">
          {[s.rollNo, yearLabel(s.year), s.branch].filter(Boolean).join(" · ")}
        </p>
      </td>
      <td className="px-3 py-3">
        <Contact s={s} />
      </td>
      <td className="px-3 py-3">
        <Ai s={s} />
      </td>
      <td className="nums px-3 py-3 text-right text-ink-800">{s.cgpa?.toFixed(1) ?? "—"}</td>
      <td className="px-3 py-3 text-sm">
        <Online at={s.lastSeenAt ?? s.lastActivityAt} now={now} />
      </td>
      <td className="px-3 py-3">
        {s.offersPending > 0 ? (
          <span className="relative z-10 inline-flex flex-wrap items-center gap-2">
            <Pill tone="waiting" className="nums">
              {s.offersPending} waiting
            </Pill>
            <NudgeButton kind="offer" userIds={[s.userId]} size="xs" />
          </span>
        ) : (
          <span className="nums text-text-subtle">{s.proposals || "—"}</span>
        )}
      </td>
      <td className="nums px-5 py-3 text-ink-700">
        {s.interviewsScheduled + s.driveMeetings > 0 ? s.interviewsScheduled + s.driveMeetings : "—"}
      </td>
    </tr>
  );
}

function MobileRow({ s, now }: { s: StudentRow; now: number }) {
  return (
    <div className="relative flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Link
          href={`/college/students/${s.userId}`}
          className="font-medium text-ink-900 outline-none touch:inline-flex touch:min-h-11 touch:items-center after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
        >
          {s.name || s.email}
        </Link>
        <p className="mt-0.5 truncate text-xs text-text-subtle">
          {[s.rollNo, yearLabel(s.year), s.branch].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5">
          <Contact s={s} />
        </div>
        <p className="mt-1.5 text-sm">
          <Online at={s.lastSeenAt ?? s.lastActivityAt} now={now} />
        </p>
        {s.offersPending > 0 ? (
          <div className="relative z-10 mt-2 flex items-center gap-2">
            <Pill tone="waiting" className="nums">
              {s.offersPending} offer waiting
            </Pill>
            <NudgeButton kind="offer" userIds={[s.userId]} size="xs" />
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <Ai s={s} />
        <p className="nums mt-0.5 text-xs text-text-subtle">CGPA {s.cgpa?.toFixed(1) ?? "—"}</p>
      </div>
    </div>
  );
}
