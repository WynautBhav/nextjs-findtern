"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { ONLINE_WINDOW_MS } from "@/lib/college/constants";
import { COHORTS, aiStatusLabel, ago, yearLabel } from "@/lib/college/labels";
import { cn } from "@/lib/utils";
import { EmptyScene, FilterTabs, Pill } from "@/components/app/primitives";
import { DataTable } from "@/components/app/data-table";
import { Section } from "@/components/app/stat";
import { NudgeButton } from "./nudge-button";
import type { StudentRow } from "./types";

type Filter = "all" | "no_interview" | "offers" | "unverified" | "offline";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "no_interview", label: "Interview not done" },
  { id: "offers", label: "Offer waiting on reply" },
  { id: "offline", label: "Inactive 7+ days" },
  { id: "unverified", label: "Not on roster" },
];

const WEEK = 7 * 86400_000;
/** Rows rendered before "Show all": a 500-student college was a 1 MB page. */
const PAGE = 50;

export function StudentTable({ students, now }: { students: StudentRow[]; now: number }) {
  const [cohort, setCohort] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
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
      if (cohort !== "all" && String(s.year) !== cohort) return false;
      if (filter === "no_interview" && aiStatusLabel(s.aiStatus).done) return false;
      if (filter === "offers" && s.offersPending === 0) return false;
      if (filter === "unverified" && s.status === "verified") return false;
      if (filter === "offline" && s.lastActivityAt && now - new Date(s.lastActivityAt).getTime() < WEEK) return false;
      if (term && !`${s.name} ${s.rollNo ?? ""} ${s.branch ?? ""} ${s.email}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [students, cohort, filter, q, now]);

  const shown = showAll ? rows : rows.slice(0, PAGE);
  const chaseIds = filter === "no_interview" || filter === "offers" ? rows.map((r) => r.userId) : [];

  return (
    <Section title="Students" hint="Everyone who picked your college and agreed to share their progress.">
      <div className="mb-4 flex flex-col gap-3">
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Search students</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-600" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, roll number, branch"
            className="h-10 w-full rounded-md border border-ink-300 bg-surface-raised pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 max-lg:h-11"
          />
        </label>
        <FilterTabs
          label="Cohort"
          value={cohort}
          onChange={setCohort}
          tabs={[{ key: "all", label: "All years", count: counts.all }, ...COHORTS.map((c) => ({ key: String(c.year), label: c.label, count: counts[String(c.year)] ?? 0 }))]}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FilterTabs label="Filter" value={filter} onChange={(k) => setFilter(k as Filter)} tabs={FILTERS.map((f) => ({ key: f.id, label: f.label }))} />
          {chaseIds.length > 0 ? (
            <span className="lg:ml-auto">
              <NudgeButton
                key={`${filter}-${cohort}-${chaseIds.length}`}
                kind={filter === "offers" ? "offer" : "interview"}
                userIds={chaseIds}
                label={`Nudge these ${chaseIds.length}`}
              />
            </span>
          ) : null}
        </div>
      </div>

      <DataTable
        caption={`Students, ${rows.length} shown`}
        rows={shown}
        rowKey={(s) => s.userId}
        empty={
          students.length === 0 ? (
            <EmptyScene
              compact
              title="No students have joined"
              body="Students show up here once they sign up and pick your college. The invite message is on the Roster page."
              next={{ label: "Open the roster", href: "/college/roster" }}
            />
          ) : (
            <EmptyScene compact title="No students match" body="No student fits these filters. Clear a filter or the search to see everyone." />
          )
        }
        columns={[
          {
            key: "student",
            header: "Student",
            primary: true,
            cell: (s) => (
              <>
                <Link href={`/college/students/${s.userId}`} className="font-medium text-ink-900 hover:text-brand-700 touch:inline-flex touch:min-h-11 touch:items-center">
                  {s.name || s.email}
                </Link>
                <span className="block text-xs font-normal text-ink-600">
                  {[s.rollNo, yearLabel(s.year), s.branch].filter(Boolean).join(" · ")}
                  {s.status !== "verified" ? " · Claimed, not verified" : ""}
                </span>
              </>
            ),
          },
          { key: "ai", header: "AI interview", cell: (s) => <Ai s={s} /> },
          { key: "cgpa", header: "CGPA", align: "right", cell: (s) => s.cgpa?.toFixed(1) ?? "—" },
          { key: "seen", header: "Last active", cell: (s) => <Online at={s.lastSeenAt ?? s.lastActivityAt} now={now} /> },
          {
            key: "offers",
            header: "Offers",
            cell: (s) =>
              s.offersPending > 0 ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Pill tone="waiting" className="nums">{s.offersPending} waiting</Pill>
                  <NudgeButton kind="offer" userIds={[s.userId]} size="xs" />
                </span>
              ) : (
                <span className="nums text-ink-600">{s.proposals || "—"}</span>
              ),
          },
          { key: "meet", header: "Meetings", align: "right", hideOnCard: true, cell: (s) => (s.interviewsScheduled + s.driveMeetings > 0 ? s.interviewsScheduled + s.driveMeetings : "—") },
        ]}
      />

      {rows.length > shown.length ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700"
        >
          Show all {rows.length}
        </button>
      ) : null}
      <p className="mt-2 text-xs text-ink-600">
        Showing <span className="nums">{shown.length}</span> of <span className="nums">{students.length}</span>.
      </p>
    </Section>
  );
}

function Online({ at, now }: { at: string | null; now: number }) {
  const on = at && now - new Date(at).getTime() < ONLINE_WINDOW_MS;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", on ? "bg-brand-700" : "bg-ink-300")} aria-hidden />
      <span className={on ? "font-medium text-brand-900" : "text-ink-600"}>{on ? "Online" : ago(at, now)}</span>
    </span>
  );
}

function Ai({ s }: { s: StudentRow }) {
  const st = aiStatusLabel(s.aiStatus);
  if (st.done && s.score !== null) {
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <span className="nums font-semibold text-ink-900">{s.score.toFixed(1)}</span>
        <span className="text-xs text-ink-600">/ 10</span>
      </span>
    );
  }
  return <span className="text-ink-600">{st.label}</span>;
}
