import Link from "next/link";
import { CalendarDays, CalendarX2, Search } from "lucide-react";

import { EmptyScene, FilterTabs, PageHead, Pill, Surface, type Tone } from "@/components/app/primitives";
import { AutoSubmitForm } from "@/components/app/auto-submit-form";
import { buttonClass } from "@/components/ui/button";
import { hasOpenMeeting, isMeetingLinkLive, meetingTime, canLeaveFeedback, canMarkCompleted, canMarkMissed, type InterviewStage } from "@/lib/employer-interview-rules";
import { formatSlotDay } from "@/lib/format";
import { ProposalTabs } from "@/components/employer/section-tabs";
import { InterviewActions } from "@/components/employer/interview-actions";
import { BookMeetingButton } from "@/components/meetings/book-meeting-dialog";
import { OfferReply } from "@/components/meetings/offer-reply";
import { viewFor } from "@/lib/meetings/slots";
import { TakedownBanner } from "@/components/employer/takedown-banner";
import { serializeJoinInput } from "@/lib/interview-join";
import { maskMeetingLink } from "@/lib/meetings/gate";
import { emptyScheduleCopy } from "@/components/employer/schedule-empty";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/employer/ui-tokens";
import type { schema } from "@/lib/db";
import { LiveRefresh } from "@/components/app/live-refresh";

/** Each stage, as the employer reads it. */
export const STAGE: Record<InterviewStage, { label: string; tone: Tone }> = {
  awaiting_pick: { label: "Waiting on candidate", tone: "waiting" },
  expired: { label: "Meeting expired", tone: "closed" },
  employer_no_show: { label: "Meeting expired", tone: "closed" },
  upcoming: { label: "Scheduled", tone: "live" },
  live: { label: "Happening now", tone: "new" },
  over: { label: "Completed", tone: "paid" },
  missed: { label: "Meeting expired", tone: "closed" },
  closed: { label: "Closed", tone: "closed" },
};

const SOON_MS = 15 * 60_000;

export type StatusFilter = { value: string; label: string; stages: InterviewStage[] };
export type Params = { q?: string; date?: string; status?: string; project?: string; tz?: string; past?: string };
export type Section = { title: string; rows: Row[]; past?: boolean; more: number };

/** The schedule page body: head, tabs, filter card, and the dated sections of meeting rows. */
export function ScheduleView({
  all,
  shown,
  sections,
  statusFilter,
  filtering,
  shortlisted,
  downProjects,
  timezones,
  projectOptions,
  sp,
  dateFilter,
  projectFilter,
  tzFilter,
  hrefWith,
  now,
  statusFilters,
  employerId,
}: {
  /** The signed-in employer, for "Book meeting" on a cancelled row. */
  employerId: string;
  all: Row[];
  shown: Row[];
  sections: Section[];
  statusFilter: StatusFilter | null;
  filtering: boolean;
  shortlisted: number;
  downProjects: [string, string][];
  timezones: string[];
  projectOptions: string[];
  sp: Params;
  dateFilter: string;
  projectFilter: string;
  tzFilter: string;
  hrefWith: (change: Record<string, string>) => string;
  now: number;
  statusFilters: StatusFilter[];
}) {
  const field = fieldClass;
  // Candidates this company has an open meeting with: "Book meeting" on a cancelled row of theirs is dimmed.
  const openWith = new Set([...new Set(all.map((x) => x.iv.internId))].filter((id) => hasOpenMeeting(all.filter((x) => x.iv.internId === id).map((x) => x.iv))));
  return (
    <div>
      <LiveRefresh everyMs={30_000} />
      <PageHead
        title="Schedule"
        lede={all.length === 0 ? "Meetings you book with candidates land here, with what to do about each one." : "Time slots show in each meeting's own time zone. The join link works from here."}
        action={
          <Link href="/employer/cart" className={buttonClass({ variant: "outline", size: "sm" })}>
            <CalendarDays className="size-4" aria-hidden />
            Book from your shortlist
          </Link>
        }
        className="mb-4 lg:mb-5"
      />
      <ProposalTabs active="interviews" />
      {downProjects.length > 0 ? (
        <div className="my-4">
          <TakedownBanner projects={downProjects.map(([id, name]) => ({ id, name }))} />
        </div>
      ) : null}

      {all.length === 0 ? (
        <EmptyScene
          art
          title="No meetings yet"
          {...emptyScheduleCopy(shortlisted)}
        />
      ) : (
        <>
          {/* One card: status as pill filters with counts (the page-level Proposals | Interviews
              tabs above are the only underline tabs), then the filters, which apply as they change. */}
          <Surface className="mb-5 flex flex-col gap-3 p-3 sm:p-4">
            <FilterTabs
              label="Show interviews"
              value={statusFilter?.value ?? "all"}
              hrefFor={(key) => hrefWith({ status: key, past: "" })}
              tabs={[
                { key: "all", label: "All", count: all.length },
                ...statusFilters.map((f) => ({ key: f.value, label: f.label, count: all.filter((r) => f.stages.includes(r.stage)).length })).filter(
                  (t) => t.count > 0 || t.key === statusFilter?.value,
                ),
              ]}
            />
            <AutoSubmitForm className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.4fr)_10rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
              {sp.status !== undefined || statusFilter ? <input type="hidden" name="status" value={statusFilter?.value ?? "all"} /> : null}
              <label className="relative col-span-2 block lg:col-span-1">
                <span className="sr-only">Search by initials or project</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
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
          </Surface>

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
                  <h2 className="mb-2 text-base font-semibold text-ink-900">{sec.title}</h2>
                  <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
                    {sec.rows.map((r) => (
                      <ScheduleRow key={r.iv.id} r={r} now={now} past={sec.past === true} employerId={employerId} meetingOpen={openWith.has(r.iv.internId)} />
                    ))}
                  </Surface>
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

export type Row = {
  iv: typeof schema.interviews.$inferSelect;
  stage: InterviewStage;
  tz: string;
  sortAt: number | null;
  name: string;
  initials: string;
  project: string | null;
  feedback: string | null;
  /** The interview's project is taken down by Findtern: no action on it. */
  down: boolean;
  /** When this company last sent the candidate a reminder (email and in-app); null when it never did. */
  reminderAt: number | null;
};

export const dayKey = (t: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);

export function dayLabel(t: number, tz: string, now: number): string {
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

function ScheduleRow({ r, now, past, employerId, meetingOpen }: { r: Row; now: number; past: boolean; employerId: string; meetingOpen: boolean }) {
  const { iv, stage } = r;
  const slots = [iv.slot1, iv.slot2, iv.slot3].filter((x): x is NonNullable<typeof x> => Boolean(x));
  const link = isMeetingLinkLive(iv, now) ? maskMeetingLink(iv.meetingLink) : null;
  const picked = iv.selectedSlot ? meetingTime(iv) : null;
  // Links open days early (isMeetingLinkLive); Join is the filled button only within 15 minutes of the start.
  const soon = picked !== null && now >= picked - SOON_MS && isMeetingLinkLive(iv, now);
  const waiting = stage === "awaiting_pick";
  const view = viewFor(iv, "employer", now);
  const requested = waiting && view.requested;
  // A time offer the candidate made before this rule (the employer picks one of its times, or offers three of their own).
  const theirs = waiting && view.turn === "yours";
  const cancelled = (iv.status ?? "").toLowerCase() === "cancelled";
  const pill = cancelled
    ? { label: "Cancelled", tone: "closed" as Tone, icon: <CalendarX2 /> }
    : requested
        ? { label: "Offer 3 new time slots", tone: "new" as Tone, icon: undefined }
        : theirs
      ? { label: "Candidate proposed time slots", tone: "new" as Tone, icon: undefined }
      : { label: STAGE[stage].label, tone: STAGE[stage].tone, icon: stage === "expired" ? <CalendarX2 /> : undefined };
  const lapsedOffer = stage === "expired" && !iv.selectedSlot;
  const clock = r.sortAt === null ? null : clockOf(r.sortAt, r.tz);
  const lead = waiting ? (slots.length ? `${slots.length} time slot${slots.length === 1 ? "" : "s"}` : "No time slots") : (clock?.time ?? "To be confirmed");
  const sub = waiting ? clock?.zone : past && r.sortAt !== null ? `${formatSlotDay(new Date(r.sortAt), r.tz)} · ${clock?.zone ?? ""}` : clock?.zone;
  const offered = slots.map((s) => {
    const c = clockOf(new Date(s).getTime(), r.tz);
    return `${formatSlotDay(new Date(s), r.tz)} ${c.time}`;
  });
  const feedbackShown = r.feedback && (stage === "over" || stage === "missed");

  return (
    <li className="grid gap-y-3 px-4 py-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:px-5">
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
            <Pill tone={pill.tone} icon={pill.icon}>
              {pill.label}
            </Pill>
            {waiting ? (
              <>
                <span aria-hidden>·</span>
                <span>{requested ? "Candidate asked to reschedule" : iv.proposedBy === "intern" ? "Candidate proposed" : "You offered 3 time slots"}</span>
              </>
            ) : null}
          </p>
          {r.reminderAt !== null && (stage === "upcoming" || waiting) ? (
            <p className="nums mt-1 text-sm text-ink-600">
              Reminder sent {formatSlotDay(new Date(r.reminderAt), r.tz)} {clockOf(r.reminderAt, r.tz).time}
            </p>
          ) : null}
          {lapsedOffer ? <p className="mt-1 text-sm text-ink-600">Nobody picked a time before the offer ran out. Offer 3 new time slots.</p> : null}
          {cancelled ? (
            <p className="mt-1 text-sm text-ink-600">
              {iv.cancelledBy === "intern" ? "The candidate cancelled this meeting." : iv.cancelledBy === "employer" ? "You cancelled this meeting." : "This meeting was cancelled."}
              {iv.cancelReason ? <> Reason: <span className="whitespace-pre-line text-ink-800">{iv.cancelReason}</span></> : null}
            </p>
          ) : null}
          {waiting && !theirs && offered.length ? (
            <p className="nums mt-1 text-sm text-ink-600">
              <span className="sr-only">Offered time slots: </span>
              {offered.join(" · ")}
            </p>
          ) : null}
          {requested ? (
            <p className="mt-1 text-sm text-ink-600">
              The candidate asked to reschedule. Cancel this meeting and book a new one if you still want to meet.
              {iv.cancelReason ? (
                <>
                  {" "}
                  Their note: <span className="whitespace-pre-line text-ink-800">{iv.cancelReason}</span>
                </>
              ) : null}
            </p>
          ) : null}
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
        takenDown={r.down}
        joinInput={serializeJoinInput(iv)}
        serverNow={new Date(now).toISOString()}
        bookAgain={
          (cancelled || stage === "expired" || stage === "employer_no_show") && !r.down ? (
            <BookMeetingButton
              employerId={employerId}
              internId={iv.internId}
              projectId={iv.projectId}
              projectName={r.project}
              candidateLabel={r.name}
              defaultTimezone={r.tz}
              lockTimezone={Boolean(iv.projectId)}
              meetingOpen={meetingOpen}
            />
          ) : null
        }
        turn={view.turn}
        requested={requested}
        canCancel={view.canCancel && !theirs && !r.down}
      />
      {theirs && !r.down ? (
        <div className="min-w-0 sm:col-span-3 sm:pl-[calc(6rem+1.25rem)]">
          <OfferReply
            interviewId={iv.id}
            slots={[iv.slot1, iv.slot2, iv.slot3].flatMap((d, n) => (d ? [{ index: n + 1, iso: new Date(d).toISOString() }] : []))}
            zone={r.tz}
            role="employer"
            serverNow={new Date(now).toISOString()}
          />
        </div>
      ) : null}
    </li>
  );
}
