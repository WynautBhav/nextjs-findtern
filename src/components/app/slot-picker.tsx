"use client";

/**
 * Interview slot picking.
 *
 * The endpoint has existed and worked the whole time. The screen that used it
 * did not: the interviews page rendered the interview's timezone as its only
 * descriptive text, so a candidate could see that a meeting existed and never
 * saw when it was. The three times the employer offered were in the database
 * the whole time, one column each.
 *
 * ── Why this is three calm cards and not a dropdown ─────────────────────
 *
 * Picking a time is a comparison, and a dropdown hides the comparison behind
 * one interaction. Three times side by side, with the day and the clock and
 * the zone on each, lets a person choose in one look. It also removes the
 * failure mode where someone opens a picker, misreads a timezone, confirms,
 * and discovers the error an hour later.
 *
 * ── Selection is reversible, so it is not a commitment ──────────────────
 *
 * There is a second endpoint, `/reschedule`, that the employer owns. We do not
 * offer an intern a cancel button that does not exist. We offer the choice
 * once, we confirm it plainly, and we say what happens next.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, CalendarCheck, Check } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { Surface } from "@/components/app/primitives";
import { formatSlotDay, formatSlotTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Slot = { index: number; iso: string };

export function SlotPicker({
  interviewId,
  slots,
  timezone,
  chosen,
  meetUrl,
}: {
  interviewId: string;
  slots: Slot[];
  timezone: string | null;
  /** 1, 2 or 3 once they have answered. */
  chosen: number | null;
  meetUrl: string | null;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [asked, setAsked] = useState(false);

  async function askForNewTimes() {
    setError(null);
    const res = await csrfFetch(`/api/interviews/${interviewId}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.ok) {
      setAsked(true);
      startTransition(() => router.refresh());
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Couldn't send that. Try again.");
    }
  }
  const [pending, startTransition] = useTransition();

  async function confirm(slot: number) {
    setError(null);
    try {
      const res = await csrfFetch(`/api/interviews/${interviewId}/select-slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That time could not be saved. Try again in a moment.");
        return;
      }
      setPicked(slot);
      setSaved(true);
      startTransition(() => router.refresh());
    } catch {
      setError("You appear to be offline. Your choice was not sent.");
    }
  }

  const active = picked ?? chosen;

  return (
    <Surface className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
            {chosen || saved ? "Your interview time" : "Choose a time that works"}
          </h2>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-600">
            {chosen || saved
              ? "This is the time the company was sent. You will get a reminder the day before."
              : `All times are in ${timezone ?? "your local zone"}. Pick one and we will tell them.`}
          </p>
        </div>
        {meetUrl && (chosen || saved) ? (
          <a
            href={meetUrl}
            target="_blank"
            rel="noreferrer"
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
          >
            <CalendarCheck className="size-4" aria-hidden />
            Join link
          </a>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-[10px] bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {slots.map((slot) => {
          const isActive = active === slot.index;
          const isPendingChoice = picked === slot.index && !chosen;
          return (
            <li key={slot.index}>
              <button
                type="button"
                onClick={() => (chosen || saved ? undefined : confirm(slot.index))}
                disabled={pending || isPendingChoice || Boolean(chosen)}
                aria-pressed={isActive}
                className={cn(
                  "apple-spring apple-pressable flex min-h-24 w-full flex-col items-start rounded-[10px] border p-4 text-left",
                  isActive
                    ? "border-brand-600 bg-brand-50 shadow-[0_0_0_1px_var(--color-brand-600)]"
                    : "border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50",
                  (chosen && !isActive) || pending
                    ? "cursor-default opacity-45"
                    : "cursor-pointer",
                )}
              >
                <span
                  className={cn(
                    "text-sm font-semibold tracking-[-0.01em] tabular-nums",
                    isActive ? "text-brand-800" : "text-ink-900",
                  )}
                >
                  {formatSlotDay(slot.iso, timezone)}
                </span>
                <span
                  className={cn("mt-0.5 text-sm tabular-nums", isActive ? "text-brand-700" : "text-ink-600")}
                >
                  {formatSlotTime(slot.iso, timezone).split(", ").slice(-1)[0]}
                </span>
                <span className="mt-auto pt-2 text-xs font-medium text-ink-500">
                  {isPendingChoice
                    ? "Sending..."
                    : isActive
                      ? "Chosen"
                      : chosen
                        ? "Not chosen"
                        : "Choose this"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!chosen && !saved ? (
        <p className="mt-4 text-sm text-text-subtle">
          {asked ? (
            "We've asked the company for new times."
          ) : (
            <button type="button" onClick={askForNewTimes} className="font-medium text-brand-700 underline underline-offset-4">
              None of these work? Ask for new times
            </button>
          )}
        </p>
      ) : null}

      <AnimatePresence>
        {saved ? (
          <motion.p
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            role="status"
            className="mt-4 flex items-center gap-2 rounded-[10px] bg-success-soft px-3.5 py-3 text-sm font-medium text-success"
          >
            <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
            Sent. The company has your chosen time and a calendar invite is on its way.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </Surface>
  );
}
