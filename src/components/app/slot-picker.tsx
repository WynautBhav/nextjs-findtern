"use client";

/**
 * Interview slot picking, for interns.
 *
 * The company offers up to three times in its own timezone; they are stored
 * as UTC instants (converted with the company's DST on that day) and shown
 * here in India time, labelled IST, whatever zone they were booked in (bug
 * sheet 7, S2 r7; INW-09). Three times side by side, because picking a time is
 * a comparison and a dropdown hides it.
 *
 * There is no "none of these work" button any more (bug sheet 7, S1 r69 and
 * S2 r6). Once a time is picked the card turns into the booking, with the
 * Join button behind the meeting rules gate (INW-10).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import { MeetingJoinButton } from "@/components/intern/meeting-join";
import { csrfFetch } from "@/lib/client-fetch";
import { formatIst, formatIstClock, formatIstDay, IST_ZONE } from "@/lib/format";
import { cn } from "@/lib/utils";

type Slot = { index: number; iso: string; passed?: boolean };

export function SlotPicker({
  interviewId,
  slots,
  timezone,
  chosen,
  meetUrl,
}: {
  interviewId: string;
  slots: Slot[];
  /** The zone the company booked in; shown as a note, never used for display. */
  timezone: string | null;
  /** 1, 2 or 3 once they have answered. */
  chosen: number | null;
  meetUrl: string | null;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<number | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function confirm(slot: number) {
    setError(null);
    setSending(slot);
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
      startTransition(() => router.refresh());
    } catch {
      setError("You appear to be offline. Your choice was not sent.");
    } finally {
      setSending(null);
    }
  }

  const active = chosen ?? picked;
  const booked = active ? slots.find((s) => s.index === active) : undefined;
  // "America/New_York" reads as "New York".
  const otherZone =
    timezone && timezone !== IST_ZONE && timezone !== "Asia/Calcutta"
      ? (timezone.split("/").pop() ?? timezone).replace(/_/g, " ")
      : null;

  if (booked) {
    return (
      <div>
        <div className="flex flex-col gap-4 rounded-apple-lg bg-brand-50/70 p-4 ring-1 ring-inset ring-brand-200/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-brand-800">Your interview time</p>
            <p className="nums mt-1 text-lg font-semibold tracking-[-0.01em] text-ink-900">{formatIst(booked.iso)}</p>
          </div>
          {meetUrl ? <MeetingJoinButton link={meetUrl} /> : null}
        </div>
        <AnimatePresence>
          {picked && !chosen ? (
            <motion.p
              initial={reduce ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              role="status"
              className="mt-3 flex items-center gap-2 text-sm font-medium text-success"
            >
              <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
              Sent. The company has your time and a calendar invite is on its way.
            </motion.p>
          ) : null}
        </AnimatePresence>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-600">
          {meetUrl
            ? "Join a few minutes early. The rules for the meeting open when you press Join."
            : "The meeting link appears here and in your email before the interview. You get a reminder the day before."}
        </p>
      </div>
    );
  }

  const choosable = slots.filter((s) => !s.passed);

  return (
    <div>
      <p className="text-pretty text-sm leading-relaxed text-ink-600">
        Pick the time that suits you. All times are in India time (IST)
        {otherZone ? `, converted from the company's ${otherZone} time` : ""}.
      </p>

      {error ? (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-apple-sm bg-danger-soft px-3.5 py-3 text-sm text-danger">
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {slots.map((slot) => {
          const isSending = sending === slot.index;
          const disabled = Boolean(slot.passed) || sending !== null || pending;
          return (
            <li key={slot.index}>
              <button
                type="button"
                onClick={() => confirm(slot.index)}
                disabled={disabled}
                className={cn(
                  "apple-spring apple-pressable flex min-h-16 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-apple-lg border border-ink-200/80 bg-white px-4 py-3 text-left shadow-xs sm:min-h-24 sm:flex-col sm:flex-nowrap sm:items-start sm:justify-start sm:gap-0 sm:py-4",
                  "hover:border-brand-400 hover:bg-brand-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  "disabled:cursor-not-allowed disabled:hover:border-ink-200/80 disabled:hover:bg-white",
                  slot.passed && "opacity-50",
                )}
              >
                <span className="flex flex-col">
                  <span className="nums text-sm font-semibold text-ink-900">{formatIstDay(slot.iso)}</span>
                  <span className="nums mt-0.5 text-base font-semibold tracking-[-0.01em] text-brand-800">{formatIstClock(slot.iso)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-ink-600 sm:mt-auto sm:pt-2">
                  {isSending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      Sending...
                    </>
                  ) : slot.passed ? (
                    "This time has passed"
                  ) : (
                    "Pick this time"
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {choosable.length === 0 ? (
        <p className="mt-3 text-sm text-ink-600">Every offered time has passed. The company can send new ones.</p>
      ) : null}
    </div>
  );
}
