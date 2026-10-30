import type { Metadata } from "next";
import Link from "next/link";

import { EmptyScene, PageHead, Pill, SectionHead, Surface, type Tone } from "@/components/app/primitives";
import { SlotPicker } from "@/components/app/slot-picker";
import { AiInterviewJoinCard } from "@/components/intern/ai-interview-join-card";
import { isScored } from "@/lib/ai-interview";
import { AiInterviewButton } from "@/components/intern/activation-card";
import { AgendaRow } from "@/components/intern/interviews/agenda";
import { ScoreReport } from "@/components/intern/interviews/score-report";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { requireRole } from "@/lib/auth";
import { isMeetingLinkLive, isStaleInterview } from "@/lib/employer-interview-rules";
import { formatIst } from "@/lib/format";
import { HIDDEN_COMPANY, loadInternData, projectNames } from "@/lib/intern-data";
import { isPast, slotOf, type InterviewRow } from "@/lib/journey";
import { isInternPaid } from "@/lib/payments";

export const metadata: Metadata = {
  title: "Interviews & Assessment",
  robots: { index: false, follow: false },
};

/**
 * Template: list, ordered by state. Whatever needs the intern comes first
 * (the AI interview's own step, company rounds to pick a time for or join),
 * then the Findtern Score (ring + radar), then past rounds. The AI interview
 * is Findtern's, labelled "AI Interview", never "Hidden company" (bug sheet 7,
 * S1 r63). Every time here is India time, labelled IST (INW-09, S2 r7).
 */
export default async function InternInterviews() {
  const session = await requireRole("intern");

  const [data, paid] = await Promise.all([loadInternData(session.uid), isInternPaid(session.uid)]);

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
  // Legacy admin kept these on the AI interview row's notes only.
  const { feedbackLink: aiFeedbackLink, recordingLink: aiRecordingLink } = await aiInterviewLinks(session.uid, extra);

  const companyLine = (i: InterviewRow) => {
    const name = data.names[i.employerId];
    return name && name !== HIDDEN_COMPANY ? name : "Company shared after hire";
  };
  const titleOf = (i: InterviewRow) => (i.projectId && projects[i.projectId]) || "Company interview";

  const scored = findternScore > 0 || Object.values(ratings).some((v) => Number(v) > 0);
  // Once the score is on the page, the AI card would only repeat it.
  const showAiCard = Boolean(aiInterview) && !(scored && isScored(extra));
  const slotsOf = (i: InterviewRow) =>
    [i.slot1, i.slot2, i.slot3].flatMap((d, n) =>
      // Keep each slot's column number (1..3): select-slot reads by position,
      // so an empty slot 1 must not renumber slot 2.
      d instanceof Date ? [{ index: n + 1, iso: d.toISOString(), passed: isPast(d) }] : [],
    );

  const agenda =
    upcoming.length > 0 ? (
      <section className="space-y-4">
        <SectionHead
          title="Company interviews"
          action={
            <Link href="/intern/record" className="text-sm font-medium text-primary underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
              What companies see
            </Link>
          }
        />
        <Surface as="ul" className="divide-y divide-ink-100">
          {upcoming.map((i) => {
            const slots = slotsOf(i);
            const booked = Boolean(i.selectedSlot);
            const when = booked ? slotOf(i) : null;
            return (
              <AgendaRow
                key={i.id}
                iso={when ? when.toISOString() : null}
                title={titleOf(i)}
                company={companyLine(i)}
                status={booked ? <Pill tone="live">Booked</Pill> : slots.length > 0 ? <Pill tone="waiting">Pick a time</Pill> : <Pill tone="neutral">Times to follow</Pill>}
              >
                {slots.length > 0 ? (
                  <SlotPicker
                    interviewId={i.id}
                    slots={slots}
                    timezone={i.timezone}
                    chosen={i.selectedSlot}
                    meetUrl={isMeetingLinkLive(i) ? i.meetingLink : null}
                  />
                ) : (
                  <p className="text-pretty text-sm text-text-subtle">
                    The company has not sent its times yet. They appear here as soon as they are set.
                  </p>
                )}
              </AgendaRow>
            );
          })}
        </Surface>
      </section>
    ) : null;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHead title="Interviews" lede="Your Findtern Score and the rounds companies book with you. Every time here is India time (IST)." />

      {/* What needs you comes first: the AI interview's own step, then company rounds to pick or join. */}
      {showAiCard && aiInterview ? (
        <AiInterviewJoinCard
          interviewId={aiInterview.id}
          status={aiInterview.status}
          meetingLink={aiInterview.meetingLink}
          internId={session.uid}
          scored={isScored(extra)}
          updatedAt={toIso((aiInterview as InterviewRow & { updatedAt?: Date | null }).updatedAt)}
        />
      ) : null}

      {!aiInterview && !scored ? (
        paid ? (
          <Surface as="section" aria-labelledby="ai-apply" className="p-5 lg:p-6">
            <h2 id="ai-apply" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
              Your AI interview
            </h2>
            <p className="mt-1 max-w-xl text-pretty text-sm text-text-subtle">
              It produces your Findtern Score, the number companies shortlist on. Company interviews follow from there.
            </p>
            <div className="mt-4">
              <AiInterviewButton internId={session.uid} />
            </div>
          </Surface>
        ) : upcoming.length === 0 && past.length === 0 ? (
          // One honest empty state for a new intern, not one per section.
          <EmptyScene
            as="h2"
            title="Your interviews start with the AI interview"
            body="It opens once the one-time activation is done and produces your Findtern Score. When a company wants to meet you after that, it sends three times here and you pick one."
            next={{ label: "Go to activation", href: "/intern/dashboard" }}
          />
        ) : (
          <p className="text-pretty text-sm text-text-subtle">
            Your AI interview opens once the one-time activation is done.{" "}
            <Link href="/intern/dashboard" className="font-medium text-primary underline-offset-4 hover:underline">
              Go to activation
            </Link>
          </p>
        )
      ) : null}

      {agenda}

      {scored ? (
        <ScoreReport findternScore={findternScore} ratings={ratings} feedbackLink={aiFeedbackLink} recordingLink={aiRecordingLink} />
      ) : null}

      {scored && upcoming.length === 0 && past.length === 0 ? (
        data.stage === "working" ? (
          <p className="text-pretty text-sm text-text-subtle">
            No company interviews. You are working on a placement, so companies are not booking rounds with you.
          </p>
        ) : (
          <EmptyScene
            as="h2"
            title="No company interviews yet"
            body="When a company wants to talk before sending an offer, it sends up to three times here. You pick one and join from this page."
            who="Companies invite you"
            next={{ label: "Look at open roles", href: "/intern/opportunities" }}
          />
        )
      ) : null}

      {past.length > 0 ? (
        <section className="space-y-4">
          <SectionHead title={`Past interviews · ${past.length}`} />
          {/* A finished round is read, not acted on: muted date blocks, outcome, feedback. */}
          <Surface as="ul" className="divide-y divide-ink-100">
            {past.map((i) => {
              const outcome = pastOutcome(i);
              const feedback = feedbackText(i.notes);
              const when = i.selectedSlot ? slotOf(i) : null;
              return (
                <AgendaRow
                  key={i.id}
                  past
                  iso={when ? when.toISOString() : null}
                  title={titleOf(i)}
                  company={companyLine(i)}
                  status={<Pill tone={outcome.tone}>{outcome.label}</Pill>}
                >
                  {when ? <p className="nums text-sm text-ink-700">{formatIst(when, { year: true })}</p> : null}
                  {outcome.label === "Interview done" && feedback ? (
                    <div className="mt-2 rounded-apple-md bg-brand-50/70 p-4">
                      <p className="text-xs font-medium text-brand-800">Feedback from the company</p>
                      <p className="mt-1 text-pretty text-sm text-ink-800">{feedback}</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-pretty text-sm text-text-subtle">{outcome.detail}</p>
                  )}
                </AgendaRow>
              );
            })}
          </Surface>
        </section>
      ) : null}
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
