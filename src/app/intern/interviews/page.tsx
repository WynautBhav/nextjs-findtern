import type { Metadata } from "next";
import { ArrowRight, CalendarClock } from "lucide-react";
import { eq } from "drizzle-orm";

import { EmptyScene, PageHead, Pill, SectionHead, Surface, type Tone } from "@/components/app/primitives";
import { SlotPicker } from "@/components/app/slot-picker";
import { AiFeedbackReport } from "@/components/employer/ai-feedback-report";
import { AiInterviewJoinCard } from "@/components/intern/ai-interview-join-card";
import { isScored } from "@/lib/ai-interview";
import { AiInterviewButton } from "@/components/intern/activation-card";
import { ButtonLink } from "@/components/ui/button";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { requireRole } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { isMeetingLinkLive, isStaleInterview } from "@/lib/employer-interview-rules";
import { formatIst } from "@/lib/format";
import { HIDDEN_COMPANY, loadInternData, projectNames } from "@/lib/intern-data";
import { isPast, slotOf, type InterviewRow } from "@/lib/journey";
import { readSkillRatings } from "@/lib/onboarding";
import { isInternPaid } from "@/lib/payments";

export const metadata: Metadata = {
  title: "Interviews & Assessment",
  robots: { index: false, follow: false },
};

/**
 * The AI interview and its report first (it is Findtern's, and labelled
 * "AI Interview", never "Hidden company": bug sheet 7, S1 r63), then company
 * rounds: the ones to pick a time for or join, then past ones. Every time an
 * intern reads here is in India time, labelled IST (INW-09, S2 r7).
 */
export default async function InternInterviews() {
  const session = await requireRole("intern");

  const db = getDb();
  const [[user], data, paid] = await Promise.all([
    db
      .select({ firstName: schema.users.firstName, lastName: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.id, session.uid))
      .limit(1),
    loadInternData(session.uid),
    isInternPaid(session.uid),
  ]);

  const candidateName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Candidate" : "Candidate";

  // The AI interview is the row owned by Findtern's AI interviewer (newest
  // first); everything else is a company round.
  const isAi = (i: InterviewRow) => data.aiEmployerIds.has(i.employerId);
  const aiInterview = data.interviews.find(isAi);
  const company = data.interviews.filter((i) => !isAi(i));
  const projects = await projectNames(company.map((i) => i.projectId ?? ""));

  // A booked meeting stays upcoming, with its Join button, until the link
  // window closes (legacy: slot + 60 min), not the moment it starts. An open
  // invite whose times have all passed is over.
  const joinable = (i: InterviewRow) => Boolean(i.selectedSlot) && isMeetingLinkLive(i);
  const upcoming = company.filter(
    (i) => (i.status === "scheduled" || i.status === "pending") && (!isStaleInterview(i) || joinable(i)),
  );
  const past = company.filter((i) => !upcoming.includes(i) && i.status !== "draft");

  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const findternScore = Number(extra.findternScore ?? 0);
  const ratings = (extra.ratings ?? {}) as { communication?: number; coding?: number; aptitude?: number; interview?: number };
  const skills = readSkillRatings(data.onboarding?.skills, extra).map((s) => s.name);
  // Legacy admin kept these on the AI interview row's notes only.
  const { feedbackLink: aiFeedbackLink, recordingLink: aiRecordingLink } = await aiInterviewLinks(session.uid, extra);

  const companyLine = (i: InterviewRow) => {
    const name = data.names[i.employerId];
    return name && name !== HIDDEN_COMPANY ? name : "Company shared after hire";
  };
  const titleOf = (i: InterviewRow) => (i.projectId && projects[i.projectId]) || "Company interview";

  return (
    <div className="space-y-10">
      <PageHead
        title="Interviews"
        lede="Your AI interview and Findtern Score, and the interview rounds companies book with you. Times are in India time (IST)."
      />

      {/* ── AI interview ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHead title="AI Interview" hint="Findtern's own interview. It produces the score companies see." />

        {!aiInterview && !(findternScore > 0) ? (
          <Surface className="p-6">
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
                <ButtonLink href="/intern/dashboard" variant="primary" className="mt-4 text-sm font-semibold">
                  Go to activation
                  <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </>
            )}
          </Surface>
        ) : null}

        {aiInterview ? (
          <AiInterviewJoinCard
            interviewId={aiInterview.id}
            status={aiInterview.status}
            meetingLink={aiInterview.meetingLink}
            internId={session.uid}
            scored={isScored(extra)}
            updatedAt={toIso((aiInterview as InterviewRow & { updatedAt?: Date | null }).updatedAt)}
          />
        ) : null}

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

      {/* ── Company rounds ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHead title="Company interviews" hint="Pick a time when a company invites you. Join from here when it is time." />

        {upcoming.length === 0 ? (
          <EmptyScene
            art
            title="No company interviews right now"
            body="When a company wants to talk before sending an offer, it sends up to three times here. You pick one, in India time, and join from this page."
            who="Companies invite you"
            next={{ label: "Look at open roles", href: "/intern/opportunities" }}
          />
        ) : (
          <ul className="space-y-4">
            {upcoming.map((i) => {
              const slots = [i.slot1, i.slot2, i.slot3].flatMap((d, n) =>
                // Keep each slot's column number (1..3): select-slot reads by
                // position, so an empty slot 1 must not renumber slot 2.
                d instanceof Date ? [{ index: n + 1, iso: d.toISOString(), passed: isPast(d) }] : [],
              );
              const booked = Boolean(i.selectedSlot);
              return (
                <li key={i.id}>
                  <Surface as="article" className="p-5 sm:p-6">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-pretty text-base font-semibold tracking-[-0.01em] text-ink-900">{titleOf(i)}</h3>
                        <p className="mt-0.5 text-sm text-ink-600">{companyLine(i)}</p>
                      </div>
                      {booked ? <Pill tone="live">Booked</Pill> : slots.length > 0 ? <Pill tone="waiting">Pick a time</Pill> : <Pill tone="neutral">Times to follow</Pill>}
                    </div>
                    {slots.length > 0 ? (
                      <SlotPicker
                        interviewId={i.id}
                        slots={slots}
                        timezone={i.timezone}
                        chosen={i.selectedSlot}
                        meetUrl={isMeetingLinkLive(i) ? i.meetingLink : null}
                      />
                    ) : (
                      <p className="text-pretty text-sm leading-relaxed text-ink-600">
                        The company has not sent its times yet. Nothing to do now; they appear here as soon as they are set.
                      </p>
                    )}
                  </Surface>
                </li>
              );
            })}
          </ul>
        )}

        {past.length > 0 ? (
          <div className="pt-4">
            <SectionHead title={`Past interviews · ${past.length}`} />
            <ul className="space-y-3">
              {past.map((i) => {
                const outcome = pastOutcome(i);
                const feedback = feedbackText(i.notes);
                return (
                  <li key={i.id}>
                    <Surface as="article" className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-pretty text-sm font-semibold text-ink-900">{titleOf(i)}</h3>
                          <p className="mt-0.5 text-sm text-ink-600">{companyLine(i)}</p>
                        </div>
                        <Pill tone={outcome.tone}>{outcome.label}</Pill>
                      </div>
                      <p className="nums mt-3 flex items-center gap-1.5 text-sm text-ink-700">
                        <CalendarClock className="size-4 text-ink-500" aria-hidden />
                        {i.selectedSlot || outcome.label !== "Expired" ? formatIst(slotOf(i) ?? i.createdAt, { year: true }) : "No time was picked"}
                      </p>
                      {outcome.label === "Interview done" && feedback ? (
                        <div className="mt-3 rounded-apple-lg bg-brand-50/70 p-4 ring-1 ring-inset ring-brand-200/70">
                          <p className="text-xs font-semibold text-brand-800">Feedback from the company</p>
                          <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-800">{feedback}</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">{outcome.detail}</p>
                      )}
                    </Surface>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      <Surface className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">Preparing for a company interview</h2>
          <p className="mt-1 max-w-xl text-pretty text-sm leading-relaxed text-ink-600">
            Companies see your AI interview scores before they meet you. Look over your record so you know what they have seen.
          </p>
        </div>
        <ButtonLink href="/intern/record" variant="outline" className="text-sm">
          Your verified record
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </Surface>
    </div>
  );
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * How a finished company round reads (INW-20): a picked time that has passed
 * is an interview that happened; an invite nobody picked a time for expired.
 */
function pastOutcome(i: InterviewRow): { label: string; tone: Tone; detail: string } {
  const status = (i.status ?? "").toLowerCase();
  if (status === "missed") {
    return {
      label: "Missed",
      tone: "closed",
      // INW-22: no off-platform contact; support handles it.
      detail: "This round was marked as missed. If that is wrong, write to communicate@findtern.in and we will look into it.",
    };
  }
  if (status === "cancelled") return { label: "Cancelled", tone: "neutral", detail: "This interview was cancelled." };
  if (status === "completed" || i.selectedSlot) {
    return { label: "Interview done", tone: "paid", detail: "No written feedback yet. Any offer that follows lands in Offers." };
  }
  if (isStaleInterview(i)) {
    return { label: "Expired", tone: "closed", detail: "Every offered time passed before one was picked, so this invite expired." };
  }
  return { label: "Closed", tone: "neutral", detail: "This interview is closed." };
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
