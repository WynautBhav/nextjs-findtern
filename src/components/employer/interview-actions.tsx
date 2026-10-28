"use client";

/**
 * What an interviewer can do to one interview, by stage.
 *
 * The schedule used to show the same four buttons on every row, greyed out
 * when they didn't apply. Now the row's stage (`interviewStage`) decides
 * which actions exist at all (DESIGN.md §7.5):
 *
 *   awaiting_pick → Send reminder · Offer new times
 *   expired       → Offer new times
 *   upcoming      → Join meeting · Send reminder · Reschedule
 *   live          → Join meeting · Mark missed (after the grace period)
 *   over          → Leave feedback · Mark missed
 *   missed        → Leave feedback
 *
 * Reschedule and feedback open an inline panel; reminder and mark-missed are
 * one click (mark-missed asks once). The server's refusal is shown verbatim.
 *
 * The first of those (Join when there is a link) is the card's one visible
 * button; the others, the profile and Mark missed sit in its ⋯ menu.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, Check, Loader2, MessageSquare, UserRound, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { isQuarterHourWall, suggestedSlots, type InterviewStage } from "@/lib/employer-interview-rules";
import { MeetingSlots, type Slots } from "@/components/employer/meeting-slots";
import { JoinMeetingButton } from "@/components/employer/meeting-join";
import { RowMenu } from "@/components/app/row-menu";

type Panel = "none" | "reschedule" | "feedback" | "missed";

export function InterviewActions({
  interviewId,
  stage,
  timezone = "Asia/Kolkata",
  meetingLink = null,
  canMarkMissed = false,
  canFeedback = false,
  internHref,
}: {
  interviewId: string;
  stage: InterviewStage;
  /** The interview's timezone; suggested slots are wall-clock times in it. */
  timezone?: string;
  /** Live link (already hidden an hour after the start). */
  meetingLink?: string | null;
  /** Scheduled, and the start plus 15 minutes has passed. */
  canMarkMissed?: boolean;
  /** Over or missed, and no feedback yet (it is shared once). */
  canFeedback?: boolean;
  internHref: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slots>(["", "", ""]);
  const [feedback, setFeedback] = useState("");

  async function post(path: string, body: unknown, label: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const res = await csrfFetch(`/api/interviews/${encodeURIComponent(interviewId)}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not ${label}.`);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${label}.`);
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

  async function reschedule() {
    if (slots.some((v) => !v)) return setError("Offer three times.");
    if (!slots.every(isQuarterHourWall)) return setError("Slots start on the hour or at :15, :30 or :45.");
    if (new Set(slots).size !== 3) return setError("Offer three different times.");
    // Wall-clock; the server applies the interview's timezone.
    if (await post("reschedule", { slot1: slots[0], slot2: slots[1], slot3: slots[2] }, "reschedule")) {
      setNotice("New times offered. The candidate has been told.");
      setPanel("none");
      router.refresh();
    }
  }

  async function sendFeedback() {
    if (!feedback.trim()) return setError("Write the feedback first.");
    if (await post("feedback", { feedback: feedback.trim() }, "save the feedback")) {
      setNotice("Feedback shared with the candidate.");
      setPanel("none");
      setFeedback("");
      router.refresh();
    }
  }

  function toggle(next: Panel) {
    setError(null);
    if (next === "reschedule" && panel !== "reschedule") setSlots(suggestedSlots(Date.now(), timezone));
    setPanel(panel === next ? "none" : next);
  }

  const canRemind = stage === "awaiting_pick" || stage === "upcoming";
  const canReschedule = stage === "awaiting_pick" || stage === "expired" || stage === "upcoming";
  const missedShown = canMarkMissed && (stage === "live" || stage === "over");
  const linkShown = Boolean(meetingLink) && (stage === "upcoming" || stage === "live");
  const primary: "join" | "feedback" | "remind" | "reschedule" | null = linkShown
    ? "join"
    : canFeedback
      ? "feedback"
      : stage === "expired"
        ? "reschedule"
        : canRemind
          ? "remind"
          : canReschedule
            ? "reschedule"
            : null;

  return (
    <div className="mt-5 border-t border-ink-100 pt-4">
      {/* One visible action by stage; the rest in a menu (QA-121: two to four
          buttons a card). Panels still open inline under the card. */}
      <div className="flex flex-wrap items-center gap-2">
        {primary === "join" ? <JoinMeetingButton link={meetingLink!} /> : null}
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
        {primary === "reschedule" ? (
          <button
            type="button"
            onClick={() => toggle("reschedule")}
            aria-expanded={panel === "reschedule"}
            disabled={busy !== null}
            className={buttonClass({ variant: stage === "expired" ? "primary" : "outline", size: "sm" })}
          >
            <CalendarClock className="size-4" aria-hidden />
            {stage === "upcoming" ? "Reschedule" : "Offer new times"}
          </button>
        ) : null}
        <RowMenu
          label="More actions for this interview"
          className="ml-auto"
          items={[
            ...(canRemind && primary !== "remind" ? [{ label: "Send reminder", onSelect: () => void remind(), icon: <Bell />, disabled: busy !== null }] : []),
            ...(canReschedule && primary !== "reschedule"
              ? [{ label: stage === "upcoming" ? "Reschedule" : "Offer new times", onSelect: () => toggle("reschedule"), icon: <CalendarClock />, disabled: busy !== null }]
              : []),
            ...(canFeedback && primary !== "feedback" ? [{ label: "Leave feedback", onSelect: () => toggle("feedback"), icon: <MessageSquare /> }] : []),
            { label: "Open profile", href: internHref, icon: <UserRound /> },
            ...(missedShown ? [{ label: "Mark missed", onSelect: () => toggle("missed"), icon: <X />, destructive: true, disabled: busy !== null }] : []),
          ]}
        />
      </div>

      {panel === "reschedule" ? (
        <div className="mt-4 rounded-apple-lg border border-ink-200/80 bg-ink-50/70 p-4">
          <p className="text-sm font-semibold text-ink-900">Offer three new times</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            Suggested: the next quarter hour, then one and two hours after it. Change any of them. Times are in {timezone}.
          </p>
          <div className="mt-3">
            <MeetingSlots slots={slots} onChange={setSlots} timezone={timezone} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={reschedule} disabled={busy !== null} className={buttonClass({ size: "sm" })}>
              {busy === "reschedule" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Offer these times
            </button>
            <button type="button" onClick={() => setPanel("none")} className={buttonClass({ variant: "ghost", size: "sm" })}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {panel === "feedback" ? (
        <div className="mt-4 rounded-apple-lg border border-ink-200/80 bg-ink-50/70 p-4">
          <label htmlFor={`feedback-${interviewId}`} className="text-sm font-semibold text-ink-900">
            Feedback for the candidate
          </label>
          <p className="mt-1 text-sm text-ink-600">Shared once, and the candidate reads it as written.</p>
          <textarea
            id={`feedback-${interviewId}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="What went well, what was missing, and what happens next."
            className="apple-spring mt-3 w-full rounded-apple-sm border border-ink-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-ink-900 outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20"
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
        <div className="mt-4 rounded-apple-lg border border-ink-200/80 bg-ink-50/70 p-4">
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
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-700">
          <Check className="size-4" aria-hidden />
          {notice}
        </p>
      ) : null}
    </div>
  );
}
