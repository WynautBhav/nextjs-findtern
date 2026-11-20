import type { Metadata } from "next";
import { and, count, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { feedbackTextOf } from "@/lib/interview-feedback";
import { interviewStage, meetingTime, slotTimes, stageRank } from "@/lib/employer-interview-rules";
import { PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { projectZone } from "@/lib/timezones";
import { dayLabel, ScheduleView, type Params, type Row, type StatusFilter } from "./schedule-view";

export const metadata: Metadata = {
  title: "Schedule",
  robots: { index: false, follow: false },
};

const PAST_PAGE = 5;

/** Status filter, in legacy's vocabulary (employer-schedule.tsx:331). */
const STATUS_FILTERS: StatusFilter[] = [
  { value: "scheduled", label: "Scheduled", stages: ["upcoming", "live"] },
  { value: "sent", label: "Waiting on candidate", stages: ["awaiting_pick"] },
  { value: "expired", label: "Expired", stages: ["expired", "employer_no_show"] },
  { value: "completed", label: "Completed", stages: ["over"] },
  { value: "missed", label: "Missed", stages: ["missed"] },
];

/**
 * Schedule.
 *
 * Every interview this company has set up, sorted the way legacy sorted it:
 * booked first, then waiting on the candidate, expired, done; then by time.
 * Each row is a small state machine (`interviewStage`): only the actions that
 * mean something at that point in the interview's life are offered, so a
 * reminder never shows on a finished meeting and feedback never shows before
 * one. Filters are a plain GET form, so they survive a refresh and a link.
 */
export default async function EmployerSchedule({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireRole("employer");
  const uid = session.uid;
  // The setup check runs beside the page's reads, not ahead of them (one round trip less); its redirect still wins,
  // before anything renders (awaited below, and ahead of the load-error state).
  const setup = requireEmployerSetup(uid);
  setup.catch(() => undefined);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  // Typed as DD/MM/YYYY (bug sheet 7); older links carried YYYY-MM-DD.
  const dateTyped = (sp.date ?? "").trim();
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateTyped);
  const dateFilter = dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}$/.test(dateTyped) ? dateTyped : "";
  // "All" is its own value so that, with no choice made, the Scheduled tab opens (bug sheet 12 Nov, row 9).
  const scheduledFilter = STATUS_FILTERS[0];
  const projectFilter = (sp.project ?? "").trim();
  const tzFilter = (sp.tz ?? "").trim();

  let rows: (typeof schema.interviews.$inferSelect)[] = [];
  const names = new Map<string, string>();
  const initials = new Map<string, string>();
  const projectNames = new Map<string, string>();
  const projectZones = new Map<string, string | null>();
  const downProjects = new Map<string, string>(); // taken down by Findtern: view only
  let shortlisted = 0;
  try {
    const db = getDb();
    // Wave 1: the interviews and the hired set read together (neither needs the other). The no-op catch only keeps
    // a read nobody reaches (the interviews read failed first) from becoming an unhandled rejection.
    const hiredP = Promise.resolve(hiredInternIds(db, uid));
    hiredP.catch(() => undefined);
    rows = await db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.employerId, uid))
      .orderBy(desc(schema.interviews.createdAt));

    const internIds = Array.from(new Set(rows.map((r) => r.internId)));
    const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter(Boolean))) as string[];
    // Wave 2: what depends on the interviews. The shortlist count is only for the empty state: whether anyone is on the
    // shortlist (a candidate already proposed to still is).
    const [unlocked, users, projects, shortlistRows] = await Promise.all([
      hiredP,
      internIds.length
        ? db
            .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
            .from(schema.users)
            .where(inArray(schema.users.id, internIds))
        : Promise.resolve([]),
      projectIds.length
        ? db
            .select({ id: schema.projects.id, projectName: schema.projects.projectName, timezone: schema.projects.timezone, takenDownAt: schema.projects.takenDownAt })
            .from(schema.projects)
            .where(inArray(schema.projects.id, projectIds))
        : Promise.resolve([]),
      rows.length === 0
        ? db
            .select({ n: count() })
            .from(schema.employerCartItems)
            .where(and(eq(schema.employerCartItems.employerId, uid), inArray(schema.employerCartItems.listType, ["cart", "checkout"])))
        : Promise.resolve([] as { n: number }[]),
    ]);
    if (rows.length === 0) shortlisted = Number(shortlistRows[0]?.n ?? 0);
    for (const u of users) {
      const first = (u.firstName || "").trim();
      const last = (u.lastName || "").trim();
      const ini = initialsOf(first, last);
      initials.set(u.id, ini === "?" ? "C" : ini);
      names.set(u.id, displayNameOf({ id: u.id, fullName: `${first} ${last}`.trim() || "Candidate", initials: ini }, unlocked.has(u.id)));
    }
    for (const p of projects) {
      projectNames.set(p.id, p.projectName);
      projectZones.set(p.id, p.timezone);
      if (p.takenDownAt) downProjects.set(p.id, p.projectName);
    }
  } catch (err) {
    // A redirect from the setup check wins over the error state.
    await setup;
    console.error("[employer/schedule] load failed", err);
    const retryQs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
    const retryHref = `/employer/schedule${retryQs.size ? `?${retryQs}` : ""}`;
    return (
      <div>
        <PageHead title="Schedule" />
        <LoadError what="your schedule" retryHref={retryHref} email={SITE.adminEmail} />
      </div>
    );
  }

  await setup;
  const now = requestTime();
  const all = rows.map((iv) => {
    const stage = interviewStage(iv, now);
    const when = meetingTime(iv);
    // Each meeting reads on its project's clock (feedback sheet 2, row 7); the zone it was booked in only if the project has none.
    const tz = projectZone(iv.projectId ? projectZones.get(iv.projectId) : null, iv.timezone);
    return {
      iv,
      stage,
      tz,
      // Booked: the picked slot; otherwise the earliest offered one.
      sortAt: iv.selectedSlot ? when : (slotTimes(iv).sort((a, b) => a - b)[0] ?? null),
      name: names.get(iv.internId) ?? "Candidate",
      initials: initials.get(iv.internId) ?? "C",
      project: iv.projectId ? (projectNames.get(iv.projectId) ?? "Project") : null,
      feedback: feedbackTextOf(iv.notes) || null,
      down: Boolean(iv.projectId && downProjects.has(iv.projectId)),
    };
  });

  // No tab chosen: Scheduled, unless nothing is scheduled (then an empty default would hide everything).
  const chosen = STATUS_FILTERS.find((s) => s.value === sp.status) ?? null;
  const statusFilter =
    chosen ?? (sp.status === undefined && all.some((r) => scheduledFilter.stages.includes(r.stage)) ? scheduledFilter : null);
  const timezones = Array.from(new Set(all.map((r) => r.tz))).sort();
  const projectOptions = Array.from(new Set(all.map((r) => r.project).filter((p): p is string => Boolean(p)))).sort();

  const shown = all
    .filter((r) => {
      if (statusFilter && !statusFilter.stages.includes(r.stage)) return false;
      if (projectFilter && r.project !== projectFilter) return false;
      if (tzFilter && r.tz !== tzFilter) return false;
      // Names are masked before a hire, so search matches what is on screen.
      if (q && !r.name.toLowerCase().includes(q) && !r.initials.toLowerCase().includes(q) && !(r.project ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (dateFilter) {
        if (r.sortAt === null) return false;
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: r.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(r.sortAt);
        if (day !== dateFilter) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const rank = stageRank(a.stage) - stageRank(b.stage);
      if (rank !== 0) return rank;
      if (a.sortAt === null) return 1;
      if (b.sortAt === null) return -1;
      // Upcoming soonest first; finished ones most recent first.
      return stageRank(a.stage) >= 2 ? b.sortAt - a.sortAt : a.sortAt - b.sortAt;
    });

  /** This page's URL with some query values replaced; "" removes one. */
  const hrefWith = (change: Record<string, string>) => {
    const next = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
    for (const [k, v] of Object.entries(change)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    return qs ? `/employer/schedule?${qs}` : "/employer/schedule";
  };

  // Day sections, in each meeting's own time zone: booked by day, then waiting, then past.
  const bySoonest = (a: Row, b: Row) => (a.sortAt ?? Infinity) - (b.sortAt ?? Infinity);
  const days = new Map<string, Row[]>();
  for (const r of shown.filter((x) => x.stage === "upcoming" || x.stage === "live").sort(bySoonest)) {
    const label = r.sortAt === null ? "Time to be confirmed" : dayLabel(r.sortAt, r.tz, now);
    days.set(label, [...(days.get(label) ?? []), r]);
  }
  const waiting = shown.filter((x) => x.stage === "awaiting_pick").sort(bySoonest);
  const past = shown.filter((x) => x.stage === "over" || x.stage === "missed" || x.stage === "expired" || x.stage === "employer_no_show" || x.stage === "closed").sort((a, b) => (b.sortAt ?? 0) - (a.sortAt ?? 0));
  const pastShown = sp.past === "all" ? past : past.slice(0, PAST_PAGE);
  const sections = [
    ...Array.from(days, ([title, rows]) => ({ title, rows, more: 0 })),
    ...(waiting.length ? [{ title: "Waiting on the candidate to pick", rows: waiting, more: 0 }] : []),
    ...(past.length ? [{ title: "Past", rows: pastShown, past: true, more: past.length - pastShown.length }] : []),
  ];
  const filtering = Boolean(q || dateFilter || chosen || projectFilter || tzFilter);

  return (
    <ScheduleView
      all={all}
      shown={shown}
      sections={sections}
      statusFilter={statusFilter}
      filtering={filtering}
      shortlisted={shortlisted}
      downProjects={[...downProjects]}
      timezones={timezones}
      projectOptions={projectOptions}
      sp={sp}
      dateFilter={dateFilter}
      projectFilter={projectFilter}
      tzFilter={tzFilter}
      hrefWith={hrefWith}
      now={now}
      statusFilters={STATUS_FILTERS}
    />
  );
}

/** The request's clock, read once so every row is staged against the same instant. */
function requestTime(): number {
  return Date.now();
}
