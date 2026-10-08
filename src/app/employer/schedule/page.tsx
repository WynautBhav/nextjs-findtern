import { desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { isPast } from "@/lib/journey";
import { InterviewActions } from "@/components/employer/interview-actions";

/**
 * Schedule.
 *
 * The previous version printed the literal status string in a list and showed
 * a Join link if one happened to exist. The legacy page carried the actual
 * job: which candidate, which project, the three offered slots, and — the part
 * that matters day to day — the four actions an interviewer needs before and
 * after the call: send a reminder, reschedule with new slots, leave feedback,
 * mark it missed.
 *
 * Every one of those endpoints already existed
 * (`/api/interviews/[id]/{send-reminder,reschedule,feedback,mark-missed}`).
 * What was missing was the buttons.
 */
export default async function EmployerSchedule() {
  const session = await getSession();
  const uid = session!.uid;

  let rows: (typeof schema.interviews.$inferSelect)[] = [];
  try {
    rows = await getDb()
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.employerId, uid))
      .orderBy(desc(schema.interviews.createdAt));
  } catch {
    // DB unavailable — say so with an empty list rather than a stack trace.
  }

  const internIds = Array.from(new Set(rows.map((r) => r.internId)));
  const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter(Boolean))) as string[];

  const names = new Map<string, string>();
  const projectNames = new Map<string, string>();
  try {
    const db = getDb();
    if (internIds.length > 0) {
      const users = await db
        .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
        .from(schema.users)
        .where(inArray(schema.users.id, internIds));
      for (const u of users) names.set(u.id, `${u.firstName} ${u.lastName}`.trim() || "Candidate");
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
        <EmptyState title="No interviews" body="Scheduled interviews will appear here." />
      ) : (
        <ul className="space-y-3">
          {rows.map((i) => {
            const slots = [i.slot1, i.slot2, i.slot3].filter((s): s is Date => s instanceof Date);
            const chosen = i.selectedSlot && i.selectedSlot >= 1 ? i.selectedSlot : null;
            const past = slots.length > 0 && isPast(slots[0]);
            return (
              <li key={i.id} className="rounded-xl border border-ink-100 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {names.get(i.internId) ?? "Candidate"}
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
                                  ? "rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800"
                                  : "rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600"
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
                    <StatusPill status={i.status} />
                    {i.meetingLink ? (
                      <a
                        href={i.meetingLink}
                        className="inline-flex h-9 items-center rounded-lg border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
                      >
                        Join meeting
                      </a>
                    ) : null}
                  </div>
                </div>

                <InterviewActions interviewId={i.id} past={past} status={i.status} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-ink-100 text-ink-700",
  scheduled: "bg-brand-100 text-brand-800",
  sent: "bg-brand-100 text-brand-800",
  completed: "bg-brand-100 text-brand-800",
  expired: "bg-ink-100 text-ink-500",
  missed: "bg-danger-soft text-danger",
  cancelled: "bg-ink-100 text-ink-500",
};

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status.toLowerCase()] ?? "bg-ink-100 text-ink-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.08em] ${tone}`}>
      {status}
    </span>
  );
}