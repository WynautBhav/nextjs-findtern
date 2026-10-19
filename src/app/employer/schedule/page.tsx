import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canMarkMissed, displayInterviewStatus, isMeetingLinkLive } from "@/lib/employer-interview-rules";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { Pill } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { interviewPill } from "@/components/app/status";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { InterviewActions } from "@/components/employer/interview-actions";

/**
 * Schedule.
 *
 * The previous version printed the literal status string in a list and showed
 * a Join link if one happened to exist. The legacy page carried the actual
 * job: which candidate, which project, the three offered slots, and - the part
 * that matters day to day - the four actions an interviewer needs before and
 * after the call: send a reminder, reschedule with new slots, leave feedback,
 * mark it missed.
 *
 * Every one of those endpoints already existed
 * (`/api/interviews/[id]/{send-reminder,reschedule,feedback,mark-missed}`).
 * What was missing was the buttons.
 */
export default async function EmployerSchedule() {
  const session = await requireRole("employer");
  const uid = session.uid;

  let rows: (typeof schema.interviews.$inferSelect)[] = [];
  try {
    rows = await getDb()
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.employerId, uid))
      .orderBy(desc(schema.interviews.createdAt));
  } catch {
    // DB unavailable - say so with an empty list rather than a stack trace.
  }

  const internIds = Array.from(new Set(rows.map((r) => r.internId)));
  const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter(Boolean))) as string[];

  const names = new Map<string, string>();
  const projectNames = new Map<string, string>();
  try {
    const db = getDb();
    let unlocked = new Set<string>();
    try {
      unlocked = await hiredInternIds(db, uid);
    } catch {
      unlocked = new Set<string>();
    }
    if (internIds.length > 0) {
      const users = await db
        .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
        .from(schema.users)
        .where(inArray(schema.users.id, internIds));
      for (const u of users) {
        const first = (u.firstName || "").trim();
        const last = (u.lastName || "").trim();
        names.set(
          u.id,
          displayNameOf(
            { fullName: `${first} ${last}`.trim() || "Candidate", initials: initialsOf(first, last) },
            unlocked.has(u.id),
          ),
        );
      }
    }
    if (projectIds.length > 0) {
      const projects = await db
        .select({ id: schema.projects.id, projectName: schema.projects.projectName })
        .from(schema.projects)
        .where(inArray(schema.projects.id, projectIds));
      for (const p of projects) projectNames.set(p.id, p.projectName);
    }
  } catch {
    // Names are decoration here; the rows still render.
  }

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Interviews you have scheduled, and what to do about each one."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No interviews"
          body="Scheduled interviews will appear here. Browse candidates and send a proposal to get the first one booked."
          action={{ label: "Browse candidates", href: "/employer/candidates" }}
          who="You - send the first proposal"
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((i) => {
            const slots = [i.slot1, i.slot2, i.slot3].filter((s): s is Date => s instanceof Date);
            const chosen = i.selectedSlot && i.selectedSlot >= 1 ? i.selectedSlot : null;
            // "Past" for actions means the meeting time plus the 15-minute
            // grace (mark missed); a pending invite whose slots all passed
            // shows as expired; the join link goes an hour after the start.
            const past = canMarkMissed(i);
            const shownStatus = displayInterviewStatus(i);
            return (
              <li key={i.id} className="apple-spring rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      <Link
                        href={`/employer/intern/${encodeURIComponent(i.internId)}`}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {names.get(i.internId) ?? "Candidate"}
                      </Link>
                    </p>
                    <p className="mt-0.5 text-sm text-text-subtle">
                      {i.projectId ? (projectNames.get(i.projectId) ?? "Project") : "No project"}
                      {i.timezone ? ` · ${i.timezone}` : ""}
                    </p>
                    {slots.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {slots.map((slot, idx) => {
                          const selected = chosen === idx + 1;
                          return (
                            <li
                              key={slot.toISOString()}
                              className={
                                selected
                                  ? "rounded-[10px] bg-brand-50 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-brand-800"
                                  : "rounded-[10px] bg-ink-50 px-2.5 py-1.5 text-xs tabular-nums text-ink-600"
                              }
                            >
                              {slot.toLocaleString("en-IN", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                              {selected ? " · picked" : ""}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs text-ink-500">
                        No slots proposed. Reschedule to offer three times.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-3">
                    <StatusPill status={shownStatus} />
                    <div className="flex items-center gap-2">
                      <ButtonLink
                        href={`/employer/intern/${encodeURIComponent(i.internId)}`}
                        variant="outline"
                        size="sm"
                        className="min-h-11 px-3 text-xs font-medium"
                      >
                        Profile
                      </ButtonLink>
                      {i.meetingLink && isMeetingLinkLive(i) ? (
                        <ButtonLink
                          href={i.meetingLink}
                          variant="outline"
                          size="sm"
                          className="min-h-11 px-3 text-xs font-medium"
                        >
                          Join meeting
                        </ButtonLink>
                      ) : null}
                    </div>
                  </div>
                </div>

                <InterviewActions interviewId={i.id} past={past} status={i.status} timezone={i.timezone || "Asia/Kolkata"} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = interviewPill(status);
  return <Pill tone={s.tone}>{s.label}</Pill>;
}