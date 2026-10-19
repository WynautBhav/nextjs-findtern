"use client";

/**
 * The four things an interviewer does to an interview.
 *
 * All four endpoints exist and were verified in the audit; the legacy page had
 * all four buttons and the rewrite had none, which made the schedule a read-only
 * list an employer could not act on. Reminder and mark-missed are one click;
 * reschedule and feedback open a small inline panel rather than a modal,
 * because there is no surrounding context worth dimming.
 *
 * Guarded by the same rule the rest of the app follows: the button says what it
 * will do, and the server's answer is shown verbatim when it refuses.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, Check, Loader2, MessageSquare, X } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { isQuarterHourWall, suggestedSlots } from "@/lib/employer-interview-rules";

type Panel = "none" | "reschedule" | "feedback";

export function InterviewActions({
  interviewId,
  past,
  status,
  timezone = "Asia/Kolkata",
}: {
  interviewId: string;
  past: boolean;
  status: string;
  /** The interview's timezone; suggested slots are wall-clock times in it. */
  timezone?: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [slots, setSlots] = useState<[string, string, string]>(["", "", ""]);
  const [feedback, setFeedback] = useState("");

  async function post(path: string, body?: unknown, label = "action") {
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
    if (await post("send-reminder", undefined, "send a reminder")) {
      setNotice("Reminder sent to the candidate.");
      router.refresh();
    }
  }

  async function markMissed() {
    if (await post("mark-missed", undefined, "mark it missed")) {
      setNotice("Marked as missed.");
      router.refresh();
    }
  }

  async function reschedule() {
    if (slots.some((v) => !v)) {
      setError("Offer three times.");
      return;
    }
    if (!slots.every(isQuarterHourWall)) {
      setError("Slots start on the hour or at :15, :30 or :45.");
      return;
    }
    if (new Set(slots).size !== 3) {
      setError("Offer three different times.");
      return;
    }
    // Wall-clock; the server applies the interview's timezone.
    const payload = { slot1: slots[0], slot2: slots[1], slot3: slots[2] };
    if (await post("reschedule", payload, "reschedule")) {
      setNotice("New slots offered.");
      setPanel("none");
      setSlots(["", "", ""]);
      router.refresh();
    }
  }

  async function sendFeedback() {
    if (feedback.trim().length === 0) {
      setError("Write the feedback first.");
      return;
    }
    if (await post("feedback", { feedback: feedback.trim() }, "save the feedback")) {
      setNotice("Feedback saved.");
      setPanel("none");
      setFeedback("");
      router.refresh();
    }
  }

  const closed = status.toLowerCase() === "completed" || status.toLowerCase() === "cancelled";

  return (
    <div className="mt-4 border-t border-ink-100 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Action
          icon={<Bell className="size-3.5" />}
          label="Send reminder"
          onClick={remind}
          busy={busy === "send a reminder"}
          disabled={busy !== null || closed || past}
        />
        <Action
          icon={<CalendarClock className="size-3.5" />}
          label={panel === "reschedule" ? "Cancel reschedule" : "Reschedule"}
          onClick={() => {
            if (panel !== "reschedule") setSlots(suggestedSlots(Date.now(), timezone));
            setPanel(panel === "reschedule" ? "none" : "reschedule");
          }}
          active={panel === "reschedule"}
          disabled={busy !== null || closed}
        />
        <Action
          icon={<MessageSquare className="size-3.5" />}
          label={panel === "feedback" ? "Cancel feedback" : "Leave feedback"}
          onClick={() => setPanel(panel === "feedback" ? "none" : "feedback")}
          active={panel === "feedback"}
          disabled={busy !== null || closed}
        />
        {!closed ? (
          <Action
            icon={<X className="size-3.5" />}
            label="Mark missed"
            onClick={markMissed}
            busy={busy === "mark it missed"}
            disabled={busy !== null || !past}
            title={past ? undefined : "Only once the slot time has passed"}
          />
        ) : null}
      </div>

      {panel === "reschedule" ? (
        <div className="mt-4 rounded-[10px] border border-ink-200/70 bg-ink-50 p-4">
          <p className="text-sm font-medium text-ink-800">Offer three new times</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            The candidate picks one. Suggested: the next quarter hour and the two hours after it -
            change any of them. Times are read in the interview&apos;s timezone ({timezone}).
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {slots.map((value, idx) => (
              <input
                key={idx}
                type="datetime-local"
                step={900}
                required
                value={value}
                onChange={(e) => {
                  const next = [...slots] as [string, string, string];
                  next[idx] = e.target.value;
                  setSlots(next);
                }}
                aria-label={`Slot ${idx + 1}`}
                className="apple-spring min-h-11 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] tabular-nums text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={reschedule}
              disabled={busy !== null}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {busy === "reschedule" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              Offer these times
            </button>
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="apple-spring inline-flex min-h-11 items-center text-xs font-medium text-ink-600 underline-offset-4 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {panel === "feedback" ? (
        <div className="mt-4 rounded-[10px] border border-ink-200/70 bg-ink-50 p-4">
          <label htmlFor={`feedback-${interviewId}`} className="text-sm font-medium text-ink-800">
            Feedback for the candidate
          </label>
          <textarea
            id={`feedback-${interviewId}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="What went well, what was missing, and what happens next."
            className="apple-spring mt-2 min-h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3.5 py-2.5 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={sendFeedback}
              disabled={busy !== null}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {busy === "save the feedback" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              Save feedback
            </button>
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="apple-spring inline-flex min-h-11 items-center text-xs font-medium text-ink-600 underline-offset-4 hover:underline"
            >
              Cancel
            </button>
            <span className="ml-auto text-xs tabular-nums text-ink-600">{feedback.length}/2000</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-700">
          <Check className="size-3.5" aria-hidden />
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function Action({
  icon,
  label,
  onClick,
  busy,
  disabled,
  active,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        active
          ? "apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-brand-300 bg-brand-50 px-3.5 text-sm font-medium text-brand-800"
          : "apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
      {label}
    </button>
  );
}