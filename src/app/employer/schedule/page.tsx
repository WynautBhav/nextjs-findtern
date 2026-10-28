import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { CalendarDays, Search } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import {
  canLeaveFeedback,
  canMarkMissed,
  interviewStage,
  isMeetingLinkLive,
  meetingTime,
  slotTimes,
  stageRank,
  type InterviewStage,
} from "@/lib/employer-interview-rules";
import { EmptyScene, FilterTabs, PageHead, Pill, Surface, type Tone } from "@/components/app/primitives";
import { AutoSubmitForm } from "@/components/app/auto-submit-form";
import { buttonClass } from "@/components/ui/button";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { formatSlotTime } from "@/lib/format";
import { InterviewActions } from "@/components/employer/interview-actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Schedule",
  robots: { index: false, follow: false },
};

/** Each stage, as the employer reads it: a pill and one line on what happens next. */
const STAGE: Record<InterviewStage, { label: string; tone: Tone; next: string }> = {
  awaiting_pick: { label: "Waiting on candidate", tone: "waiting", next: "The candidate picks one of your three times. Nudge them with a reminder, or offer new times." },
  expired: { label: "Expired", tone: "closed", next: "Every time you offered passed without a pick. Offer three new times to keep it going." },
  upcoming: { label: "Booked", tone: "live", next: "The meeting link opens from here. You can remind the candidate or move the time." },
  live: { label: "Happening now", tone: "new", next: "The meeting is running. If the candidate didn't show, mark it missed 15 minutes after the start." },
  over: { label: "Completed", tone: "paid", next: "Share feedback with the candidate. It helps them, and it is shared once." },
  missed: { label: "Missed", tone: "closed", next: "Marked as missed. You can still leave feedback if that was a mistake." },
  closed: { label: "Closed", tone: "closed", next: "Nothing more to do here." },
};

/** Status filter, in legacy's vocabulary (employer-schedule.tsx:331). */
const STATUS_FILTERS: { value: string; label: string; stages: InterviewStage[] }[] = [
  { value: "scheduled", label: "Booked", stages: ["upcoming", "live"] },
  { value: "sent", label: "Waiting on candidate", stages: ["awaiting_pick"] },
  { value: "expired", label: "Expired", stages: ["expired"] },
  { value: "completed", label: "Completed", stages: ["over"] },
  { value: "missed", label: "Missed", stages: ["missed"] },
];

type Params = { q?: string; date?: string; status?: string; project?: string; tz?: string };

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
      names.set(u.id, displayNameOf({ fullName: `${first} ${last}`.trim() || "Candidate", initials: ini }, unlocked.has(u.id)));
    }
    for (const p of projects) projectNames.set(p.id, p.projectName);
  } catch (err) {
    console.error("[employer/schedule] load failed", err);
    return (
      <div>
        <PageHead title="Schedule" />
        <EmptyScene
          art
          title="Couldn't load your schedule"
          body="Your interviews are safe; we just couldn't reach them right now. Reload the page in a moment."
          who="Us - a connection problem"
        />
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
      feedback: feedbackOf(iv.notes),
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

  const filtering = Boolean(q || dateFilter || statusFilter || projectFilter || tzFilter);
  const booked = all.filter((r) => r.stage === "upcoming" || r.stage === "live").length;
  const waiting = all.filter((r) => r.stage === "awaiting_pick").length;
  const field =
    "apple-spring min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20";

  return (
    <div>
      <PageHead
        title="Schedule"
        lede={
          all.length === 0
            ? "Interviews you book with candidates land here, with what to do about each one."
            : `${[booked ? `${booked} booked` : "", waiting ? `${waiting} waiting on the candidate` : ""].filter(Boolean).join(", ") || "Nothing booked right now"}. Times are shown in each interview's own timezone.`
        }
        action={
          <Link href="/employer/cart" className={buttonClass({ variant: "outline", size: "sm" })}>
            <CalendarDays className="size-4" aria-hidden />
            Book from your shortlist
          </Link>
        }
      />

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
            <FilterTabs
              label="Show interviews"
              value={statusFilter?.value ?? ""}
              hrefFor={(key) => {
                const next = new URLSearchParams(
                  Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "" && e[0] !== "status"),
                );
                if (key) next.set("status", key);
                const qs = next.toString();
                return qs ? `/employer/schedule?${qs}` : "/employer/schedule";
              }}
              tabs={[
                { key: "", label: "All", count: all.length },
                ...STATUS_FILTERS.map((f) => ({ key: f.value, label: f.label, count: all.filter((r) => f.stages.includes(r.stage)).length })).filter(
                  (t) => t.count > 0 || t.key === statusFilter?.value,
                ),
              ]}
            />
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
            <ul className="space-y-3">
              {shown.map((r) => {
                const { iv, stage } = r;
                const stageInfo = STAGE[stage];
                const slots = [iv.slot1, iv.slot2, iv.slot3];
                const offered = slots.filter((x): x is NonNullable<typeof x> => Boolean(x));
                const link = iv.meetingLink && isMeetingLinkLive(iv) ? iv.meetingLink : null;
                return (
                  <Surface as="li" key={iv.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                      <div className="flex min-w-0 items-start gap-3.5">
                        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-800">
                          {r.initials}
                        </span>
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-ink-900">
                            <Link href={`/employer/intern/${encodeURIComponent(iv.internId)}`} className="hover:text-brand-700 hover:underline touch:inline-flex touch:min-h-11 touch:min-w-11 touch:items-center">
                              {r.name}
                            </Link>
                          </p>
                          <p className="mt-0.5 text-sm text-ink-600">
                            {r.project ?? "No project"} · {r.tz}
                          </p>
                        </div>
                      </div>
                      <Pill tone={stageInfo.tone}>{stageInfo.label}</Pill>
                    </div>

                    {/* All three offered times, always, with the picked one marked
                        (PRODUCT.md: which slot was chosen is the most common
                        candidate complaint). The picked time leads, larger. */}
                    {offered.length ? (
                      <ol className="nums mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 pl-[3.625rem] text-sm text-ink-600" aria-label="Offered times">
                        {slots.map((slot, idx) =>
                          slot ? (
                            <li
                              key={idx}
                              className={cn(
                                iv.selectedSlot === idx + 1 && "order-first basis-full font-semibold text-ink-900",
                                iv.selectedSlot === idx + 1 && (stage === "upcoming" || stage === "live") && "text-base",
                              )}
                            >
                              {iv.selectedSlot === idx + 1 ? (
                                <span className="mr-1.5 text-xs font-medium text-text-subtle">Picked</span>
                              ) : null}
                              {formatSlotTime(slot, r.tz)}
                            </li>
                          ) : null,
                        )}
                      </ol>
                    ) : null}

                    <p className="mt-2 pl-[3.625rem] text-sm leading-relaxed text-ink-600">
                      {r.feedback && (stage === "over" || stage === "missed") ? "Feedback shared with the candidate. Nothing more to do." : stageInfo.next}
                    </p>

                    {r.feedback ? (
                      <div className="mt-4 rounded-apple-md border border-ink-200/80 bg-ink-50/60 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Your feedback</p>
                        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-800">{r.feedback}</p>
                      </div>
                    ) : null}

                    <InterviewActions
                      interviewId={iv.id}
                      stage={stage}
                      timezone={r.tz}
                      meetingLink={link}
                      canMarkMissed={iv.status === "scheduled" && Boolean(iv.selectedSlot) && canMarkMissed(iv)}
                      canFeedback={!r.feedback && canLeaveFeedback(iv)}
                      internHref={`/employer/intern/${encodeURIComponent(iv.internId)}`}
                    />
                  </Surface>
                );
              })}
            </ul>
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

/** The employer's shared feedback, stored as a "feedback_text:" line in notes (EMB-11). */
function feedbackOf(notes: string | null): string | null {
  const raw = notes ?? "";
  const at = raw.indexOf("feedback_text:");
  if (at < 0) return null;
  const text = raw.slice(at + "feedback_text:".length).trim();
  return text || null;
}
