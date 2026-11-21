import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { EmptyScene, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { meetingSlots, OpenMeetingRow, PastMeetingRow } from "@/components/meetings/intern-rows";
import { viewFor } from "@/lib/meetings/slots";
import { AiInterviewJoinCard } from "@/components/intern/ai-interview-join-card";
import { isScored } from "@/lib/ai-interview";
import { interviewLifecycle } from "@/lib/interview-lifecycle";
import { AiInterviewButton } from "@/components/intern/activation-card";
import { splitUpcoming } from "@/components/intern/interviews/order";
import { ScoreReport } from "@/components/intern/interviews/score-report";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { requireRole } from "@/lib/auth";
import { employerNoShow } from "@/lib/employer-interview-rules";
import { HIDDEN_COMPANY, loadInternData, projectNames } from "@/lib/intern-data";
import type { InterviewRow } from "@/lib/journey";
import { isInternPaid } from "@/lib/payments";

/** Rows shown before "Show N more": a long list must not bury the score below it. */
const SHOWN = 3;

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
  const serverNow = new Date().toISOString();

  const [data, paid] = await Promise.all([loadInternData(session.uid), isInternPaid(session.uid)]);

  // The AI interview is the row owned by Findtern's AI interviewer (newest
  // first); everything else is a company round.
  const isAi = (i: InterviewRow) => data.aiEmployerIds.has(i.employerId);
  const aiInterview = data.interviews.find(isAi);
  const company = data.interviews.filter((i) => !isAi(i));
  const projects = await projectNames(company.map((i) => i.projectId ?? ""));

  // A booked meeting stays upcoming until it ends (slot + the meeting length), an open invite until its last offered time
  // passes: after that the shared interview rules read it Expired, even before the sweep has stored it.
  const upcoming = company.filter((i) => (i.status === "scheduled" || i.status === "pending") && !employerNoShow(i) && !interviewLifecycle(i).expired);
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
  const nowMs = new Date(serverNow).getTime();
  const row = (i: InterviewRow) => <OpenMeetingRow key={i.id} i={i} title={titleOf(i)} company={companyLine(i)} serverNow={serverNow} />;
  const pastRow = (i: InterviewRow) => <PastMeetingRow key={i.id} i={i} title={titleOf(i)} company={companyLine(i)} />;
  // Rounds waiting on the intern's pick come first; booked ones follow, soonest first.
  const { toPick: open, booked } = splitUpcoming(upcoming);
  // Open offers split by whose move it is: the company's wait on the intern, the intern's own wait on the company.
  const toPick = open.filter((i) => meetingSlots(i).length > 0 && viewFor(i, "intern", nowMs).turn === "yours");
  const waitingOn = open.filter((i) => !toPick.includes(i));

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHead title="Interviews" lede="Your Findtern Score and the rounds companies book with you." />

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
            body="It opens once the one-time activation is done and produces your Findtern Score. When a company wants to meet you after that, it offers three time slots here and you choose one."
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

      {scored ? (
        <ScoreReport findternScore={findternScore} ratings={ratings} feedbackLink={aiFeedbackLink} recordingLink={aiRecordingLink} />
      ) : null}

      {toPick.length > 0 ? (
        <section data-first-content className="space-y-4">
          <SectionHead
            title={toPick.length === 1 ? "Choose a time for 1 interview" : `Choose a time for ${toPick.length} interviews`}
            hint="Choose one of the 3 time slots the company offered, then confirm. If none work, ask to reschedule."
          />
          <FoldedList rows={toPick.map(row)} more="more" />
        </section>
      ) : null}

      {waitingOn.length > 0 ? (
        <section data-first-content={toPick.length === 0 ? true : undefined} className="space-y-4">
          <SectionHead title={`Waiting for the company · ${waitingOn.length}`} hint="The company is offering time slots, or has not confirmed one yet." />
          <FoldedList rows={waitingOn.map(row)} more="more" />
        </section>
      ) : null}

      {booked.length > 0 ? (
        <section data-first-content={toPick.length === 0 && waitingOn.length === 0 ? true : undefined} className="space-y-4">
          <SectionHead
            title={`Coming up · ${booked.length}`}
            action={
              <Link href="/intern/record" className="text-sm font-medium text-primary underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                What companies see
              </Link>
            }
          />
          <FoldedList rows={booked.map(row)} more="later" />
        </section>
      ) : null}

      {scored && upcoming.length === 0 && past.length === 0 ? (
        data.stage === "working" ? (
          <p className="text-pretty text-sm text-text-subtle">
            No company interviews. You are working on a placement, so companies are not booking rounds with you.
          </p>
        ) : (
          <EmptyScene
            as="h2"
            title="No meetings yet"
            body="When a company invites you to meet, it shows up here."
            who="Companies invite you"
          />
        )
      ) : null}

      {past.length > 0 ? (
        <section className="space-y-4">
          <SectionHead title={`Past interviews · ${past.length}`} />
          {/* A finished round is read, not acted on: muted date blocks, outcome, feedback. */}
          <FoldedList rows={past.map(pastRow)} more="older" shown={2} />
        </section>
      ) : null}
    </div>
  );
}

function FoldedList({ rows, more, shown = SHOWN }: { rows: React.ReactNode[]; more: string; shown?: number }) {
  return (
    <>
      <Surface as="ul" className="divide-y divide-ink-100">
        {rows.slice(0, shown)}
      </Surface>
      {rows.length > shown ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Show {rows.length - shown} {more}
            </span>
            <span className="hidden group-open:inline">Show fewer</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <Surface as="ul" className="mt-2 divide-y divide-ink-100">
            {rows.slice(shown)}
          </Surface>
        </details>
      ) : null}
    </>
  );
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
