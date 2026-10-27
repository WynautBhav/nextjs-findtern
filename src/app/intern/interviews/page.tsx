import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, Sparkles } from "lucide-react";

import { EmptyScene, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { SlotPicker } from "@/components/app/slot-picker";
import { AiFeedbackReport } from "@/components/employer/ai-feedback-report";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { isMeetingLinkLive, isStaleInterview } from "@/lib/employer-interview-rules";
import { AiInterviewJoinCard } from "@/components/intern/ai-interview-join-card";
import { AiInterviewButton } from "@/components/intern/activation-card";
import { isInternPaid } from "@/lib/payments";
import { requireRole } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { loadInternData } from "@/lib/intern-data";
import { formatDayLabel, formatSlotTime } from "@/lib/format";
import { slotOf } from "@/lib/journey";
import { readSkillRatings } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "Interviews & Assessment",
  robots: { index: false, follow: false },
};

export default async function InternInterviews() {
  const session = await requireRole("intern");

  const db = getDb();
  const [user] = await db
    .select({ firstName: schema.users.firstName, lastName: schema.users.lastName })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);

  const candidateName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Candidate" : "Candidate";

  const [data, paid] = await Promise.all([loadInternData(session.uid), isInternPaid(session.uid)]);

  // The AI interview is the row owned by Findtern's AI interviewer (newest
  // first); everything else is a company round.
  const isAi = (i: (typeof data.interviews)[number]) => data.aiEmployerIds.has(i.employerId);
  const aiInterview = data.interviews.find(isAi);

  // An open invite whose slots have all passed is expired, not upcoming. A
  // booked meeting stays upcoming, with its Join link, until the link window
  // closes (legacy: slot + 60 min), not the moment it starts.
  const joinable = (i: (typeof data.interviews)[number]) => Boolean(i.selectedSlot) && isMeetingLinkLive(i);
  const upcomingEmployerInterviews = data.interviews.filter(
    (i) => !isAi(i) && (i.status === "scheduled" || i.status === "pending") && (!isStaleInterview(i) || joinable(i)),
  );
  const past = data.interviews.filter(
    (i) => !isAi(i) && (i.status === "completed" || i.status === "missed" || (isStaleInterview(i) && !joinable(i))),
  );

  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const findternScore = Number(extra.findternScore ?? 0);
  const ratings = (extra.ratings ?? {}) as {
    communication?: number;
    coding?: number;
    aptitude?: number;
    interview?: number;
  };
  const skills = readSkillRatings(data.onboarding?.skills, extra).map((s) => s.name);

  // Legacy admin kept these on the AI interview row's notes only.
  const { feedbackLink: aiFeedbackLink, recordingLink: aiRecordingLink } = await aiInterviewLinks(session.uid, extra);

  return (
    <div className="space-y-8">
      <PageHead
        title="Interviews & AI Evaluation"
        lede="Your AI interview, your Findtern Score, and any interview rounds with companies."
      />

      {/* Assessment section */}
      <section className="space-y-4">
        <SectionHead
          title="AI interview"
          action={<Sparkles className="size-4 text-brand-600" aria-hidden />}
        />

        {/* No AI interview yet and no score: this page is where a candidate
            looks for it, so the request lives here as well as on Home. */}
        {!aiInterview && !(findternScore > 0) ? (
          <Surface className="p-5 sm:p-6">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-ink-900">Your AI interview</h3>
            {paid ? (
              <>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">
                  Request it here. The joining link arrives in your notifications, usually within two working days.
                </p>
                <AiInterviewButton internId={session.uid} />
              </>
            ) : (
              <>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">
                  The AI interview opens once the one-time activation is paid. It produces your Findtern Score.
                </p>
                <Link
                  href="/intern/dashboard"
                  className="apple-spring apple-pressable mt-4 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover"
                >
                  Go to activation
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </>
            )}
          </Surface>
        ) : null}

        {aiInterview && (
          <AiInterviewJoinCard
            interviewId={aiInterview.id}
            status={aiInterview.status}
            meetingLink={aiInterview.meetingLink}
          />
        )}

        <AiFeedbackReport
          candidateName={candidateName}
          findternScore={findternScore}
          ratings={{
            communication: ratings.communication,
            coding: ratings.coding,
            aptitude: ratings.aptitude,
            interview: ratings.interview,
          }}
          skills={skills}
          bio={data.onboarding?.bio}
          aiFeedbackLink={aiFeedbackLink}
          aiRecordingLink={aiRecordingLink}
        />
      </section>

      {/* Company Interviews */}
      <section className="space-y-6">
        <SectionHead
          title="Employer interview rounds"
          action={<Calendar className="size-4 text-brand-600" aria-hidden />}
        />

        {upcomingEmployerInterviews.length === 0 ? (
          <EmptyScene
            art
            title="No employer interviews scheduled yet"
            body="When companies review your Findtern scorecard and send proposals, their interview time options will appear right here."
            who="Offers come first"
            next={{ label: "Browse open roles", href: "/intern/opportunities" }}
          />
        ) : (
          <div className="space-y-6">
            {upcomingEmployerInterviews.map((interview) => {
              // Keep each slot's column number (1..3): select-slot reads by
              // position, so an empty slot 1 must not renumber slot 2 as 1.
              const slots = [interview.slot1, interview.slot2, interview.slot3].flatMap((d, i) =>
                d instanceof Date ? [{ index: i + 1, iso: d.toISOString() }] : [],
              );
              const company = data.names[interview.employerId] ?? "the company";
              return (
                <Surface key={interview.id} className="p-6">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div>
                      <Pill tone="live">Coming up</Pill>
                      <h3 className="mt-1.5 text-base font-semibold tracking-[-0.01em] text-ink-900">
                        Interview with {company}
                      </h3>
                    </div>
                    {interview.status === "pending" ? (
                      <Pill tone="waiting">Waiting on their time slots</Pill>
                    ) : (
                      <Pill tone="live">Scheduled</Pill>
                    )}
                  </div>

                  {slots.length > 0 ? (
                    <SlotPicker
                      interviewId={interview.id}
                      slots={slots}
                      timezone={interview.timezone}
                      chosen={interview.selectedSlot}
                      meetUrl={isMeetingLinkLive(interview) ? interview.meetingLink : null}
                    />
                  ) : (
                    <p className="text-pretty text-xs leading-relaxed text-ink-600">
                      {company} has not sent the times yet. There is nothing to do, and they will
                      appear here the moment they are set.
                    </p>
                  )}
                </Surface>
              );
            })}
          </div>
        )}

        {/* Past rounds and feedback show whether or not anything is upcoming. */}
        {past.length > 0 ? (
          <div className="mt-6 space-y-3">
            <SectionHead title="Completed & past rounds" />
            <ul className="space-y-3">
              {past.map((interview) => {
                const company = data.names[interview.employerId] ?? "the company";
                const when = slotOf(interview) ?? interview.createdAt;
                const missed = interview.status === "missed";
                const expired = isStaleInterview(interview);
                return (
                  <li key={interview.id}>
                    <Surface className="p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h3 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
                          {company}
                        </h3>
                        <p className="text-xs text-ink-600">
                          {formatDayLabel(when)} at{" "}
                          {formatSlotTime(when, interview.timezone).split(", ").slice(-1)[0]}
                        </p>
                      </div>

                      {expired ? (
                        <p className="mt-3 text-pretty text-xs leading-relaxed text-ink-600">
                          Every proposed time passed before a slot was confirmed, so this invite expired.
                        </p>
                      ) : missed ? (
                        <p className="mt-3 text-pretty text-xs leading-relaxed text-ink-600">
                          This round was marked as missed. Message the company directly if you want to reschedule.
                        </p>
                      ) : feedbackText(interview.notes) ? (
                        <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                          <p className="text-xs font-semibold text-brand-800">
                            Feedback from the company
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-ink-800">
                            {feedbackText(interview.notes)}
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
      </section>

      {/* Tips */}
      <Surface className="p-5">
        <SectionHead title="Preparing for an interview" />
        <p className="mt-1 text-xs leading-relaxed text-ink-600">
          Review your assessment results before a technical round - they show your scores across coding, communication, and problem-solving, which is exactly what the interviewer has seen.
        </p>
        <div className="mt-3">
          <Link
            href="/intern/record"
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-ink-50 px-3.5 text-xs font-semibold text-ink-800 hover:bg-ink-100"
          >
            <span>View your verified record</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </Surface>
    </div>
  );
}

/**
 * The company's feedback only: the `feedback_text:` line of the notes (legacy
 * parseNoteText). The rest of the field holds staff notes and the feedback /
 * recording links, which are not for the candidate.
 */
function feedbackText(notes: string | null): string {
  const line = (notes ?? "").split("\n").map((l) => l.trim()).find((l) => l.toLowerCase().startsWith("feedback_text:"));
  return line ? line.slice("feedback_text:".length).trim() : "";
}
