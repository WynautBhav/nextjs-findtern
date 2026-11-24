"use client";

/**
 * What an interviewer can do to one interview, by stage.
 *
 * The schedule used to show the same four buttons on every row, greyed out
 * when they didn't apply. Now the row's stage (`interviewStage`) decides
 * which actions exist at all (DESIGN.md §7.5):
 *
 *   awaiting_pick → Send reminder · Cancel
 *   expired       → Book meeting (a new one; there is no rescheduling, owner 24 Nov)
 *   employer_no_show → Book meeting (the employer didn't join within 30 minutes)
 *   upcoming      → Join meeting (Meeting link until 15 minutes before) · Send reminder · Cancel
 *   live          → Join meeting · Mark completed · Mark missed (after the grace period)
 *   over          → Leave feedback · Mark missed
 *   missed        → Leave feedback
 *
 * Feedback opens an inline panel; reminder and mark-missed are
 * one click (mark-missed asks once). The server's refusal is shown verbatim.
 *
 * The first of those (Join when there is a link) is the card's one visible
 * button; the others, the profile and Mark missed sit in its ⋯ menu.
 */

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarCheck, CalendarX2, Check, Loader2, MessageSquare, UserRound, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import type { InterviewStage } from "@/lib/employer-interview-rules";
import { CancelMeetingDialog } from "@/components/meetings/cancel-meeting-dialog";
import { JoinMeetingButton } from "@/components/employer/meeting-join";
import type { JoinInput } from "@/lib/interview-join";
import { RowMenu } from "@/components/app/row-menu";
import { fieldClass } from "@/components/employer/ui-tokens";
import { cn } from "@/lib/utils";

type Panel = "none" | "feedback" | "missed";

export function InterviewActions({
  interviewId,
  stage,
  timezone = "Asia/Kolkata",
  meetingLink = null,
  canMarkMissed = false,
  canMarkCompleted = false,
  canFeedback = false,
  internHref,
  soon = false,
  takenDown = false,
  joinInput,
  serverNow,
  turn = "none",
  requested = false,
  canCancel = false,
  bookAgain = null,
}: {
  /** A "Book meeting" for a closed, cancelled, expired or no-show meeting (the schedule passes its own button). */
  bookAgain?: React.ReactNode;
  /** Whose move an open offer is: "yours" means the candidate's offer waits on this employer (answered in the row's reply, so no reminder or revise here). */
  turn?: "yours" | "theirs" | "none";
  /** An older row where the candidate asked to reschedule (no longer possible): no reminder for it. */
  requested?: boolean;
  /** The meeting is an open offer or a booked time that has not started. */
  canCancel?: boolean;
  /** The booking as `joinState` reads it: Join is gated to 15 minutes before the start, like the intern's. */
  joinInput?: JoinInput;
  /** ISO time on the server, with `joinInput`. */
  serverNow?: string;
  interviewId: string;
  /** The project is taken down by Findtern: no join, remind, reschedule, feedback or mark: view only. */
  takenDown?: boolean;
  stage: InterviewStage;
  /** The interview's timezone; suggested slots are wall-clock times in it. */
  timezone?: string;
  /** Live link (already hidden an hour after the start). */
  meetingLink?: string | null;
  /** Scheduled, and the start plus 15 minutes has passed. */
  canMarkMissed?: boolean;
  /** Scheduled, and the start time has come: the call can be closed early. */
  canMarkCompleted?: boolean;
  /** Over or missed, and no feedback yet (it is shared once). */
  canFeedback?: boolean;
  internHref: string;
  /** The meeting starts within 15 minutes (or is on): Join is the filled action. Otherwise it is a quiet "Meeting link". */
  soon?: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  // Which input the error is about, so it can be marked invalid and focused.
  const [errorField, setErrorField] = useState<"feedback" | null>(null);
  const uid = useId();
  const errId = `${uid}-error`;
  const feedbackId = `${uid}-feedback`;
  function fail(field: "feedback", msg: string) {
    setErrorField(field);
    setError(msg);
    document.getElementById(feedbackId)?.focus();
  }

  async function post(path: string, body: unknown, label: string) {
    setBusy(label);
    setError(null);
    setErrorField(null);
    setNotice(null);
    try {
      const res = await csrfFetch(`/api/interviews/${encodeURIComponent(interviewId)}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Couldn't ${label}. Try again.`);
      return true;
    } catch (e) {
      setError(e instanceof TypeError || !(e instanceof Error) ? "Couldn't reach the server. Check your connection and try again." : e.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function remind() {
    if (await post("send-reminder", {}, "send a reminder")) {
      setNotice("Reminder sent to the candidate.");
      router.refresh();
    }
  }

  async function markMissed() {
    if (await post("mark-missed", {}, "mark it missed")) {
      setPanel("none");
      setNotice("Marked as missed.");
      router.refresh();
    }
  }

  async function markCompleted() {
    if (await post("mark-completed", {}, "mark it completed")) {
      setNotice("Marked as completed. You can send a proposal now.");
      router.refresh();
    }
  }

  async function sendFeedback() {
    if (!feedback.trim()) return fail("feedback", "Write the feedback first.");
    if (await post("feedback", { feedback: feedback.trim() }, "save the feedback")) {
      setNotice("Feedback shared with the candidate.");
      setPanel("none");
      setFeedback("");
      router.refresh();
    }
  }

  function toggle(next: Panel) {
    setError(null);
    setErrorField(null);
    setPanel(panel === next ? "none" : next);
  }

  const timePassed = stage === "expired" || stage === "employer_no_show";
  const theirOffer = stage === "awaiting_pick" && turn === "yours";
  const canRemind = (stage === "awaiting_pick" && !theirOffer && !requested) || stage === "upcoming";
  const missedShown = canMarkMissed && (stage === "live" || stage === "over");
  // Join is offered on every booked row; with no link yet it is disabled and says why (bug sheet 12 Nov, row 12).
  const linkShown = stage === "upcoming" || stage === "live";
  // An expired or no-show interview offers no Join and no reminder: Book meeting leads (feedback and "Mark completed" stay in the menu).
  const primary: "join" | "feedback" | "remind" | null = linkShown ? "join" : timePassed ? null : canFeedback ? "feedback" : canRemind ? "remind" : null;

  if (takenDown) {
    // Every action here is refused by the server while the project is taken down; none is offered.
    return (
      <div className="contents">
        <div className="flex flex-wrap items-center gap-2 sm:justify-self-end">
          <button type="button" disabled aria-disabled="true" aria-describedby={`td-${interviewId}`} tabIndex={-1} className={buttonClass({ variant: "outline", size: "sm" })}>
            Actions unavailable
          </button>
          <span id={`td-${interviewId}`} className="text-xs text-ink-700">Taken down: contact admin</span>
        </div>
      </div>
    );
  }

  return (
    // `contents`: the buttons sit in the row's last column, panels and messages span the whole row.
    <div className="contents">
      {/* One visible action by stage; the rest in a menu (QA-121: two to four
          buttons a card). Panels still open inline under the card. */}
      <div className="flex flex-wrap items-center gap-2 sm:justify-self-end">
        {primary === "join" ? (
          <JoinMeetingButton
            interviewId={interviewId}
            ready={Boolean(meetingLink)}
            interview={joinInput}
            serverNow={serverNow}
            zone={timezone}
            {...(soon ? {} : { variant: "outline" as const })}
          />
        ) : null}
        {canMarkCompleted && stage === "live" ? (
          <button type="button" onClick={markCompleted} disabled={busy !== null} className={buttonClass({ variant: "outline", size: "sm" })}>
            {busy === "mark it completed" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <CalendarCheck className="size-4" aria-hidden />}
            Mark completed
          </button>
        ) : null}
        {primary === "feedback" ? (
          <button
            type="button"
            onClick={() => toggle("feedback")}
            aria-expanded={panel === "feedback"}
            className={buttonClass({ variant: panel === "feedback" ? "outline" : "primary", size: "sm" })}
          >
            <MessageSquare className="size-4" aria-hidden />
            Leave feedback
          </button>
        ) : null}
        {primary === "remind" ? (
          <button type="button" onClick={remind} disabled={busy !== null} className={buttonClass({ variant: "outline", size: "sm" })}>
            {busy === "send a reminder" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Bell className="size-4" aria-hidden />}
            Send reminder
          </button>
        ) : null}
        {stage === "closed" || timePassed ? bookAgain : null}
        <RowMenu
          label="More actions for this interview"
          className="ml-auto"
          items={[
            ...(canRemind && primary !== "remind" ? [{ label: "Send reminder", onSelect: () => void remind(), icon: <Bell />, disabled: busy !== null }] : []),
            ...(canMarkCompleted && stage === "expired" ? [{ label: "Mark completed", onSelect: () => void markCompleted(), icon: <CalendarCheck />, disabled: busy !== null }] : []),
            ...(canFeedback && primary !== "feedback" ? [{ label: "Leave feedback", onSelect: () => toggle("feedback"), icon: <MessageSquare /> }] : []),
            { label: "Open profile", href: internHref, icon: <UserRound /> },
            ...(canCancel ? [{ label: "Cancel meeting", onSelect: () => setCancelOpen(true), icon: <CalendarX2 />, destructive: true, disabled: busy !== null }] : []),
            ...(missedShown ? [{ label: "Mark missed", onSelect: () => toggle("missed"), icon: <X />, destructive: true, disabled: busy !== null }] : []),
          ]}
        />
      </div>

      {panel === "feedback" ? (
        <div className="mt-1 rounded-apple-lg border border-ink-200/80 bg-ink-50/70 p-4 sm:col-span-3">
          <label htmlFor={feedbackId} className="text-sm font-semibold text-ink-900">
            Feedback for the candidate
          </label>
          <p className="mt-1 text-sm text-ink-600">Shared once, and the candidate reads it as written.</p>
          <textarea
            id={feedbackId}
            aria-invalid={errorField === "feedback" || undefined}
            aria-describedby={errorField === "feedback" ? errId : undefined}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="What went well, what was missing, and what happens next."
            className={cn(fieldClass, "mt-3 py-2.5 leading-relaxed")}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={sendFeedback} disabled={busy !== null} className={buttonClass({ size: "sm" })}>
              {busy === "save the feedback" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Share feedback
            </button>
            <button type="button" onClick={() => setPanel("none")} className={buttonClass({ variant: "ghost", size: "sm" })}>
              Cancel
            </button>
            <span className="nums ml-auto text-xs text-text-subtle">{feedback.length}/2000</span>
          </div>
        </div>
      ) : null}

      {panel === "missed" ? (
        <div className="mt-1 rounded-apple-lg border border-ink-200/80 bg-ink-50/70 p-4 sm:col-span-3">
          <p className="text-sm font-semibold text-ink-900">Mark this interview missed?</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            Use this when the candidate didn&apos;t join. You can still leave feedback afterwards.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={markMissed} disabled={busy !== null} className={buttonClass({ size: "sm" })}>
              {busy === "mark it missed" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Mark missed
            </button>
            <button type="button" onClick={() => setPanel("none")} className={buttonClass({ variant: "ghost", size: "sm" })}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p id={errId} role="alert" className="text-sm text-danger sm:col-span-3">
          {error}
        </p>
      ) : null}
      <CancelMeetingDialog interviewId={interviewId} open={cancelOpen} onOpenChange={setCancelOpen} other="the candidate" />
      {/* Always mounted, so the result is announced when it fills in. */}
      <p role="status" className={notice ? "inline-flex items-center gap-1.5 text-sm text-brand-700 sm:col-span-3" : "sr-only"}>
        {notice ? <Check className="size-4" aria-hidden /> : null}
        {notice}
      </p>
    </div>
  );
}
