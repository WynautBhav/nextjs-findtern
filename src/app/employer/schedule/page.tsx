import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { CalendarDays, Search } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { feedbackTextOf } from "@/lib/interview-feedback";
import {
  canLeaveFeedback,
  canMarkCompleted,
  canMarkMissed,
  interviewStage,
  isMeetingLinkLive,
  meetingTime,
  slotTimes,
  stageRank,
  type InterviewStage,
} from "@/lib/employer-interview-rules";
import { EmptyScene, PageHead, Pill, type Tone } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { AutoSubmitForm } from "@/components/app/auto-submit-form";
import { buttonClass } from "@/components/ui/button";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { formatSlotDay } from "@/lib/format";
import { ProposalTabs } from "@/components/employer/section-tabs";
import { InterviewActions } from "@/components/employer/interview-actions";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/employer/ui-tokens";

export const metadata: Metadata = {
  title: "Schedule",
  robots: { index: false, follow: false },
};

/** Each stage, as the employer reads it. */
const STAGE: Record<InterviewStage, { label: string; tone: Tone }> = {
  awaiting_pick: { label: "Waiting on candidate", tone: "waiting" },
  expired: { label: "Expired", tone: "closed" },
  upcoming: { label: "Booked", tone: "live" },
  live: { label: "Happening now", tone: "new" },
  over: { label: "Completed", tone: "paid" },
  missed: { label: "Missed", tone: "closed" },
  closed: { label: "Closed", tone: "closed" },
};

const SOON_MS = 15 * 60_000;
const PAST_PAGE = 5;

/** Status filter, in legacy's vocabulary (employer-schedule.tsx:331). */
const STATUS_FILTERS: { value: string; label: string; stages: InterviewStage[] }[] = [
  { value: "scheduled", label: "Booked", stages: ["upcoming", "live"] },
  { value: "sent", label: "Waiting on candidate", stages: ["awaiting_pick"] },
  { value: "expired", label: "Expired", stages: ["expired"] },
  { value: "completed", label: "Completed", stages: ["over"] },
  { value: "missed", label: "Missed", stages: ["missed"] },
];

type Params = { q?: string; date?: string; status?: string; project?: string; tz?: string; past?: string };

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
  await requireEmployerSetup(session.uid);
  const uid = session.uid;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  // Typed as DD/MM/YYYY (bug sheet 7); older links carried YYYY-MM-DD.
  const dateTyped = (sp.date ?? "").trim();
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateTyped);
  const dateFilter = dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}$/.test(dateTyped) ? dateTyped : "";
  const statusFilter = STATUS_FILTERS.find((s) => s.value === sp.status) ?? null;
  const projectFilter = (sp.project ?? "").trim();
  const tzFilter = (sp.tz ?? "").trim();

  let rows: (typeof schema.interviews.$inferSelect)[] = [];
  const names = new Map<string, string>();
  const initials = new Map<string, string>();
  const projectNames = new Map<string, string>();
  try {
    const db = getDb();
    rows = await db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.employerId, uid))
      .orderBy(desc(schema.interviews.createdAt));

    const internIds = Array.from(new Set(rows.map((r) => r.internId)));
    const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter(Boolean))) as string[];
    const [unlocked, users, projects] = await Promise.all([
      hiredInternIds(db, uid),
      internIds.length
        ? db
            .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
            .from(schema.users)
            .where(inArray(schema.users.id, internIds))
        : Promise.resolve([]),
      projectIds.length
        ? db
            .select({ id: schema.projects.id, projectName: schema.projects.projectName })
            .from(schema.projects)
            .where(inArray(schema.projects.id, projectIds))
        : Promise.resolve([]),
    ]);
    for (const u of users) {
      const first = (u.firstName || "").trim();
      const last = (u.lastName || "").trim();
      const ini = initialsOf(first, last);
      initials.set(u.id, ini === "?" ? "C" : ini);
      names.set(u.id, displayNameOf({ id: u.id, fullName: `${first} ${last}`.trim() || "Candidate", initials: ini }, unlocked.has(u.id)));
    }
    for (const p of projects) projectNames.set(p.id, p.projectName);
  } catch (err) {
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

  const now = requestTime();
  const all = rows.map((iv) => {
    const stage = interviewStage(iv, now);
    const when = meetingTime(iv);
    const tz = iv.timezone || "Asia/Kolkata";
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
    };
  });

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
      return stageRank(a.stage) >= 3 ? b.sortAt - a.sortAt : a.sortAt - b.sortAt;
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
  const past = shown.filter((x) => x.stage === "over" || x.stage === "missed" || x.stage === "expired" || x.stage === "closed").sort((a, b) => (b.sortAt ?? 0) - (a.sortAt ?? 0));
  const pastShown = sp.past === "all" ? past : past.slice(0, PAST_PAGE);
  const sections: { title: string; rows: Row[]; past?: boolean; more: number }[] = [
    ...Array.from(days, ([title, rows]) => ({ title, rows, more: 0 })),
    ...(waiting.length ? [{ title: "Waiting on the candidate to pick", rows: waiting, more: 0 }] : []),
    ...(past.length ? [{ title: "Past", rows: pastShown, past: true, more: past.length - pastShown.length }] : []),
  ];
  const filtering = Boolean(q || dateFilter || statusFilter || projectFilter || tzFilter);
  const field = fieldClass;

  return (
    <div>
      <PageHead
        title="Schedule"
        lede={all.length === 0 ? "Interviews you book with candidates land here, with what to do about each one." : "Times show in each meeting's own time zone. The join link works from here."}
        action={
          <Link href="/employer/cart" className={buttonClass({ variant: "outline", size: "sm" })}>
            <CalendarDays className="size-4" aria-hidden />
            Book from your shortlist
          </Link>
        }
        className="mb-4 lg:mb-5"
      />
      <ProposalTabs active="interviews" />

      {all.length === 0 ? (
        <EmptyScene
          art
          title="No interviews yet"
          body="Shortlist a candidate, then book a meeting from your shortlist: you offer three times and they pick one."
          next={{ label: "Browse candidates", href: "/employer/candidates" }}
          who="You - shortlist someone first"
        />
      ) : (
        <>
          {/* Status as tabs with counts; the rest of the filters apply as
              they change, so there is no Filter button. */}
          <div className="mb-5 flex flex-col gap-3">
            <nav aria-label="Show interviews" className="flex flex-wrap gap-x-3 border-b border-ink-100 sm:gap-x-7">
              {[
                { key: "", label: "All", count: all.length },
                ...STATUS_FILTERS.map((f) => ({ key: f.value, label: f.label, count: all.filter((r) => f.stages.includes(r.stage)).length })).filter(
                  (t) => t.count > 0 || t.key === statusFilter?.value,
                ),
              ].map((t) => {
                const on = (statusFilter?.value ?? "") === t.key;
                return (
                  <Link
                    key={t.key}
                    href={hrefWith({ status: t.key, past: "" })}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative -mb-px inline-flex min-h-12 min-w-11 items-center justify-center gap-1 whitespace-nowrap text-sm outline-none transition-colors sm:gap-1.5",
                      "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']",
                      "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent",
                      on ? "font-semibold text-ink-900 after:bg-brand-700" : "font-medium text-ink-600 hover:text-ink-900",
                    )}
                  >
                    {t.label}
                    <span className={cn("nums", on ? "text-ink-900" : "text-text-subtle")}>{t.count}</span>
                  </Link>
                );
              })}
            </nav>
            <AutoSubmitForm className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.4fr)_10rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
              {statusFilter ? <input type="hidden" name="status" value={statusFilter.value} /> : null}
              <label className="relative col-span-2 block lg:col-span-1">
                <span className="sr-only">Search by initials or project</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
                <input name="q" defaultValue={sp.q ?? ""} placeholder="Initials or project" className={cn(field, "pl-9")} />
              </label>
              <label className="block">
                <span className="sr-only">Date, DD/MM/YYYY</span>
                <input
                  name="date"
                  defaultValue={dateFilter ? dateFilter.split("-").reverse().join("/") : ""}
                  placeholder="DD/MM/YYYY"
                  inputMode="numeric"
                  pattern="\d{1,2}/\d{1,2}/\d{4}"
                  data-complete="^\d{1,2}/\d{1,2}/\d{4}$"
                  data-date="dmy"
                  className={cn(field, "nums")}
                />
              </label>
              <label className="block">
                <span className="sr-only">Project</span>
                <select name="project" defaultValue={projectFilter} className={field}>
                  <option value="">All projects</option>
                  {projectOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">Timezone</span>
                <select name="tz" defaultValue={tzFilter} className={field}>
                  <option value="">All timezones</option>
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
              {filtering ? (
                <Link href="/employer/schedule" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
                  Clear
                </Link>
              ) : null}
            </AutoSubmitForm>
          </div>

          {filtering ? (
            <p className="mb-3 text-sm text-ink-600" aria-live="polite">
              Showing <span className="nums font-semibold text-ink-900">{shown.length}</span> of{" "}
              <span className="nums">{all.length}</span> interview{all.length === 1 ? "" : "s"}
            </p>
          ) : null}

          {shown.length === 0 ? (
            <EmptyScene
              title="No interviews match these filters"
              body="Try another date or status, or clear the filters to see everything."
              next={{ label: "Clear filters", href: "/employer/schedule" }}
              who="You - loosen the filters"
            />
          ) : (
            <div>
              {sections.map((sec) => (
                <section key={sec.title} aria-label={sec.title} className="mt-8 first:mt-0">
                  <h2 className="mb-1 text-sm font-semibold text-ink-900">{sec.title}</h2>
                  <ul className="divide-y divide-ink-100 border-y border-ink-100">
                    {sec.rows.map((r) => (
                      <ScheduleRow key={r.iv.id} r={r} now={now} past={sec.past === true} />
                    ))}
                  </ul>
                  {sec.more > 0 ? (
                    <Link href={hrefWith({ past: "all" })} className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-11" })}>
                      Show {sec.more} more past meeting{sec.more === 1 ? "" : "s"}
                    </Link>
                  ) : null}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The request's clock, read once so every row is staged against the same instant. */
function requestTime(): number {
  return Date.now();
}


type Row = {
  iv: typeof schema.interviews.$inferSelect;
  stage: InterviewStage;
  tz: string;
  sortAt: number | null;
  name: string;
  initials: string;
  project: string | null;
  feedback: string | null;
};

const dayKey = (t: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);

function dayLabel(t: number, tz: string, now: number): string {
  const k = dayKey(t, tz);
  if (k === dayKey(now, tz)) return "Today";
  if (k === dayKey(now + 86_400_000, tz)) return "Tomorrow";
  return formatSlotDay(new Date(t), tz);
}

/** "5:13 pm" in the meeting's zone, and the zone's abbreviation ("IST"). */
function clockOf(t: number, tz: string): { time: string; zone: string } {
  const parts = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz, timeZoneName: "short" }).formatToParts(t);
  const zone = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const time = parts.filter((p) => p.type !== "timeZoneName").map((p) => p.value).join("").trim();
  return { time, zone };
}

function ScheduleRow({ r, now, past }: { r: Row; now: number; past: boolean }) {
  const { iv, stage } = r;
  const slots = [iv.slot1, iv.slot2, iv.slot3].filter((x): x is NonNullable<typeof x> => Boolean(x));
  const link = iv.meetingLink && isMeetingLinkLive(iv, now) ? iv.meetingLink : null;
  const picked = iv.selectedSlot ? meetingTime(iv) : null;
  // Links open days early (isMeetingLinkLive); Join is the filled button only within 15 minutes of the start.
  const soon = picked !== null && now >= picked - SOON_MS && isMeetingLinkLive(iv, now);
  const waiting = stage === "awaiting_pick";
  const clock = r.sortAt === null ? null : clockOf(r.sortAt, r.tz);
  const lead = waiting ? (slots.length ? `${slots.length} time${slots.length === 1 ? "" : "s"}` : "No times") : (clock?.time ?? "To be confirmed");
  const sub = waiting ? clock?.zone : past && r.sortAt !== null ? `${formatSlotDay(new Date(r.sortAt), r.tz)} · ${clock?.zone ?? ""}` : clock?.zone;
  const offered = slots.map((s) => {
    const c = clockOf(new Date(s).getTime(), r.tz);
    return `${formatSlotDay(new Date(s), r.tz)} ${c.time}`;
  });
  const feedbackShown = r.feedback && (stage === "over" || stage === "missed");

  return (
    <li className="grid gap-y-3 py-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5">
      <div className="max-sm:hidden">
        <p className="nums text-base font-semibold text-ink-900">{lead}</p>
        {sub ? <p className="nums text-xs text-ink-600">{sub}</p> : null}
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800">
          {r.initials}
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink-900">
            <span className="nums sm:hidden">{lead} · </span>
            <Link href={`/employer/intern/${encodeURIComponent(iv.internId)}`} className="hover:text-brand-700 hover:underline touch:inline-flex touch:min-h-11 touch:min-w-11 touch:items-center">
              {r.name}
            </Link>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-600">
            <span>{r.project ?? "No project"}</span>
            <span aria-hidden>·</span>
            <Pill tone={STAGE[stage].tone}>{STAGE[stage].label}</Pill>
          </p>
          {waiting && offered.length ? (
            <p className="nums mt-1 text-sm text-ink-600">
              <span className="sr-only">Offered times: </span>
              {offered.join(" · ")}
            </p>
          ) : null}
          {waiting && offered.length === 0 ? <p className="mt-1 text-sm text-ink-600">The candidate asked to reschedule. Offer three new times.</p> : null}
          {feedbackShown ? (
            <details className="group mt-1 text-sm text-ink-600">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 sm:min-h-0 [&::-webkit-details-marker]:hidden">
                <span className="line-clamp-1 group-open:hidden">Your feedback: {r.feedback}</span>
                <span className="shrink-0 font-medium text-brand-700 group-open:hidden">Read</span>
                <span className="hidden font-medium text-brand-700 group-open:inline">Your feedback · Hide</span>
              </summary>
              <p className="whitespace-pre-line pb-1 text-ink-800">{r.feedback}</p>
            </details>
          ) : null}
        </div>
      </div>
      <InterviewActions
        interviewId={iv.id}
        stage={stage}
        timezone={r.tz}
        meetingLink={link}
        soon={soon}
        canMarkMissed={iv.status === "scheduled" && Boolean(iv.selectedSlot) && canMarkMissed(iv)}
        canMarkCompleted={canMarkCompleted(iv)}
        canFeedback={!r.feedback && canLeaveFeedback(iv)}
        internHref={`/employer/intern/${encodeURIComponent(iv.internId)}`}
      />
    </li>
  );
}
