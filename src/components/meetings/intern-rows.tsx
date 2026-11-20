import { CalendarX2 } from "lucide-react";

import { Pill, type Tone } from "@/components/app/primitives";
import { InterviewJoin } from "@/components/intern/interview-join";
import { AgendaRow } from "@/components/intern/interviews/agenda";
import { InternMeetingActions } from "@/components/meetings/intern-meeting-actions";
import { OfferReply } from "@/components/meetings/offer-reply";
import { SITE } from "@/lib/content/site";
import { employerNoShow, isStaleInterview } from "@/lib/employer-interview-rules";
import { formatIst, IST_ZONE } from "@/lib/format";
import { feedbackForIntern } from "@/lib/interview-feedback";
import { interviewLifecycle } from "@/lib/interview-lifecycle";
import { serializeJoinInput } from "@/lib/interview-join";
import { slotOf, type InterviewRow } from "@/lib/journey";
import { MAX_ROUNDS, viewFor } from "@/lib/meetings/slots";

/** The offered times, each with its column number (1..3): select-slot reads by position, so an empty slot 1 must not renumber slot 2. */
export const meetingSlots = (i: InterviewRow) =>
  [i.slot1, i.slot2, i.slot3].flatMap((d, n) => (d instanceof Date ? [{ index: n + 1, iso: d.toISOString() }] : []));

/** An open company meeting on the intern's page: an offer to answer, the intern's own offer waiting, or a booked time. Every time is IST. */
export function OpenMeetingRow({ i, title, company, serverNow }: { i: InterviewRow; title: string; company: string; serverNow: string }) {
  const slots = meetingSlots(i);
  const view = viewFor(i, "intern", new Date(serverNow).getTime());
  const booked = Boolean(i.selectedSlot);
  const when = booked ? slotOf(i) : null;
  const mine = i.proposedBy === "intern";
  const status = booked ? (
    <Pill tone="live">Booked</Pill>
  ) : slots.length === 0 ? (
    <Pill tone="neutral">Times to follow</Pill>
  ) : view.turn === "yours" ? (
    <Pill tone="waiting">Pick a time</Pill>
  ) : (
    <Pill tone="neutral">Waiting for the company to pick</Pill>
  );
  return (
    <AgendaRow iso={when ? when.toISOString() : null} title={title} company={company} status={status}>
      {booked && when ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="nums text-sm font-medium text-ink-900">{formatIst(when)}</p>
            <div className="sm:max-w-xs sm:shrink-0">
              <InterviewJoin interview={serializeJoinInput(i)} serverNow={serverNow} />
            </div>
          </div>
          <InternMeetingActions interviewId={i.id} mode="booked" canCancel={view.canCancel} canReschedule={view.canReschedule} />
        </div>
      ) : slots.length === 0 ? (
        <p className="text-pretty text-sm text-text-subtle">The company has not sent its times yet. They appear here as soon as they are set.</p>
      ) : view.turn === "yours" ? (
        <OfferReply interviewId={i.id} slots={slots} zone={IST_ZONE} role="intern" canCounter={view.canCounter} round={view.round} serverNow={serverNow} />
      ) : (
        <div className="space-y-3">
          <p className="text-pretty text-sm text-ink-700">
            {mine ? "You sent these times. The company picks one." : "The company has not confirmed a time yet."} Times are in India time (IST).
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Times you offered">
            {slots.map((slot) => (
              <li key={slot.index} className="nums rounded-apple-sm border border-ink-200/80 bg-surface-raised px-3 py-2 text-sm font-medium text-ink-900">
                {formatIst(slot.iso)}
              </li>
            ))}
          </ul>
          {view.round > 1 ? (
            <p className="text-sm text-text-subtle">
              Round {view.round} of {MAX_ROUNDS}
            </p>
          ) : null}
          {mine ? <InternMeetingActions interviewId={i.id} mode="waiting" canCancel={view.canCancel} canReschedule={view.canReschedule} /> : null}
        </div>
      )}
    </AgendaRow>
  );
}

/** A finished company round: the outcome, feedback, and (for an expired or cancelled one) a way to ask for new times. */
export function PastMeetingRow({ i, title, company }: { i: InterviewRow; title: string; company: string }) {
  const outcome = pastOutcome(i);
  const feedback = feedbackForIntern(i.notes);
  const when = i.selectedSlot ? slotOf(i) : null;
  return (
    <AgendaRow
      past
      iso={when ? when.toISOString() : null}
      title={title}
      company={company}
      status={
        <Pill tone={outcome.tone} icon={outcome.icon}>
          {outcome.label}
        </Pill>
      }
    >
      {when ? <p className="nums text-sm text-ink-700">{formatIst(when, { year: true })}</p> : null}
      {/* The pill already says "Interview done"; its generic sentence would repeat on every row. */}
      {outcome.label === "Interview done" ? null : <p className="mt-1 text-pretty text-sm text-text-subtle">{outcome.detail}</p>}
      {/* An expired or cancelled meeting can be asked for again, inside this same relationship (the route refuses anything else). */}
      {outcome.label === "Cancelled" || outcome.label === "Expired" ? (
        <div className="mt-3">
          <InternMeetingActions interviewId={i.id} mode="request" />
        </div>
      ) : null}
      {/* A missed round can carry feedback too; the employer is told it is shared. */}
      {(outcome.label === "Interview done" || outcome.label === "Missed") && feedback ? (
        <div className="mt-2 rounded-apple-sm bg-brand-50/70 p-4">
          <p className="text-xs font-medium text-brand-800">Feedback from the company</p>
          <p className="mt-1 whitespace-pre-line text-pretty text-sm text-ink-800">{feedback}</p>
        </div>
      ) : null}
    </AgendaRow>
  );
}

/**
 * How a finished company round reads (INW-20): a picked time that has passed
 * is an interview that happened; an invite nobody picked a time for expired.
 */
function pastOutcome(i: InterviewRow): { label: string; tone: Tone; detail: React.ReactNode; icon?: React.ReactNode } {
  const status = (i.status ?? "").toLowerCase();
  if (status === "missed") {
    return {
      label: "Missed",
      tone: "closed",
      // INW-22: no off-platform contact; support handles it.
      detail: (
        <>
          This round was marked as missed. If that is wrong, write to{" "}
          <a href={`mailto:${SITE.email}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
            {SITE.email}
          </a>{" "}
          and we will look into it.
        </>
      ),
    };
  }
  if (status === "cancelled") {
    const who = i.cancelledBy === "intern" ? "You cancelled this meeting." : i.cancelledBy === "employer" ? "The company cancelled this meeting." : "This meeting was cancelled.";
    return {
      label: "Cancelled",
      tone: "neutral",
      icon: <CalendarX2 />,
      detail: (
        <>
          {who}
          {i.cancelReason ? (
            <>
              {" "}
              Reason: <span className="text-ink-800">{i.cancelReason}</span>
            </>
          ) : null}
        </>
      ),
    };
  }
  if (employerNoShow(i)) {
    return {
      label: "Employer didn't join",
      tone: "closed",
      detail: "The company did not join within 30 minutes of the start, so this round expired. It does not count against you.",
    };
  }
  if (interviewLifecycle(i).expired) {
    return {
      label: "Expired",
      tone: "closed",
      icon: <CalendarX2 />,
      detail: i.selectedSlot ? "This interview's time passed and it was not marked complete. The company can schedule it again." : "Nobody picked a time before the offer ran out, so it expired.",
    };
  }
  if (status === "completed" || i.selectedSlot) {
    return { label: "Interview done", tone: "paid", detail: "No written feedback yet. Any offer that follows lands in Offers." };
  }
  if (isStaleInterview(i)) {
    return { label: "Expired", tone: "closed", detail: "Every offered time passed before one was picked, so this invite expired." };
  }
  return { label: "Closed", tone: "neutral", detail: "This interview is closed." };
}

