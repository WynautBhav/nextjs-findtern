import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, Sparkles } from "lucide-react";

import { EmptyScene, PageHead, Surface } from "@/components/app/primitives";
import { SlotPicker } from "@/components/app/slot-picker";
import { AiFeedbackReport } from "@/components/employer/ai-feedback-report";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { loadInternData } from "@/lib/intern-data";
import { formatDayLabel, formatSlotTime } from "@/lib/format";
import { slotOf, slotsOf } from "@/lib/journey";

export const metadata: Metadata = {
  title: "Interviews & Assessment",
  robots: { index: false, follow: false },
};

export default async function InternInterviews() {
  const session = await getSession();
  if (!session) return null;

  const db = getDb();
  const [user] = await db
    .select({ firstName: schema.users.firstName, lastName: schema.users.lastName })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);

  const candidateName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Candidate" : "Candidate";

  const data = await loadInternData(session.uid);

  const upcoming = data.interviews.filter(
    (i) => i.status === "scheduled" || i.status === "pending",
  );
  const past = data.interviews.filter(
    (i) => i.status === "completed" || i.status === "missed",
  );

  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const findternScore = Number(extra.findternScore ?? 0);
  const ratings = (extra.ratings ?? {}) as {
    communication?: number;
    coding?: number;
    aptitude?: number;
    interview?: number;
  };
  const skills = Array.isArray(data.onboarding?.skills)
    ? (data.onboarding?.skills as string[])
    : [];

  return (
    <div className="space-y-8">
      <PageHead
        title="Interviews"
        lede="Your assessment results, upcoming company interviews, and feedback from past rounds."
      />

      {/* Assessment results */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-900">
            Your assessment results
          </h2>
        </div>

        <AiFeedbackReport
          candidateName={candidateName}
          findternScore={findternScore}
          ratings={{
            communication: ratings.communication,
            coding: ratings.coding,
            aptitude: ratings.aptitude,
            overall: findternScore,
          }}
          skills={skills}
          bio={data.onboarding?.bio}
        />
      </section>

      {/* Company Interviews */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-900">
            Employer Interview Rounds
          </h2>
        </div>

        {data.interviews.length === 0 ? (
          <EmptyScene
            art
            title="No employer interviews scheduled yet"
            body="When companies review your Findtern scorecard and send proposals, their interview time options will appear right here."
            who="Offers come first"
            next={{ label: "Browse open roles", href: "/intern/opportunities" }}
          />
        ) : (
          <div className="space-y-6">
            {upcoming.map((interview) => {
              const slots = slotsOf(interview).map((iso, index) => ({
                index: index + 1,
                iso: iso.toISOString(),
              }));
              const company = data.names[interview.employerId] ?? "the company";
              return (
                <div key={interview.id} className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div>
                      <span className="text-2xs font-semibold uppercase tracking-wider text-brand-700">
                        Coming up
                      </span>
                      <h3 className="text-base font-bold text-ink-900">
                        Interview with {company}
                      </h3>
                    </div>
                    {interview.status === "pending" ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-2xs font-semibold text-amber-800 border border-amber-200">
                        Waiting on their time slots
                      </span>
                    ) : (
                      <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-2xs font-semibold text-brand-700 border border-brand-200">
                        Scheduled
                      </span>
                    )}
                  </div>

                  {slots.length > 0 ? (
                    <SlotPicker
                      interviewId={interview.id}
                      slots={slots}
                      timezone={interview.timezone}
                      chosen={interview.selectedSlot}
                      meetUrl={interview.meetingLink}
                    />
                  ) : (
                    <p className="text-pretty text-xs leading-relaxed text-ink-600">
                      {company} has not sent the times yet. There is nothing to do, and they will
                      appear here the moment they are set.
                    </p>
                  )}
                </div>
              );
            })}

            {past.length > 0 ? (
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-semibold text-ink-800">
                  Completed & Past Rounds
                </h3>
                <ul className="space-y-3">
                  {past.map((interview) => {
                    const company = data.names[interview.employerId] ?? "the company";
                    const when = slotOf(interview) ?? interview.createdAt;
                    const missed = interview.status === "missed";
                    return (
                      <li key={interview.id}>
                        <Surface className="p-5">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <h4 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
                              {company}
                            </h4>
                            <p className="text-xs text-ink-500">
                              {formatDayLabel(when)} at{" "}
                              {formatSlotTime(when, interview.timezone).split(", ").slice(-1)[0]}
                            </p>
                          </div>

                          {missed ? (
                            <p className="mt-3 text-pretty text-xs leading-relaxed text-ink-600">
                              This round was marked as missed. Message the company directly if you want to reschedule.
                            </p>
                          ) : interview.notes?.trim() ? (
                            <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand-800">
                                Feedback from the company
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-ink-800">
                                {interview.notes}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-3 text-pretty text-xs leading-relaxed text-ink-600">
                              Interview done. No written feedback yet.
                            </p>
                          )}
                        </Surface>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Tips */}
      <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs">
        <h3 className="text-sm font-semibold text-ink-900">
          Preparing for an interview
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-600">
          Review your assessment results before a technical round — they show your scores across coding, communication, and problem-solving, which is exactly what the interviewer has seen.
        </p>
        <div className="mt-3">
          <Link
            href="/intern/record"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-3.5 text-xs font-semibold text-ink-800 hover:bg-ink-100 transition-colors"
          >
            <span>View your verified record</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </section>
    </div>
  );
}