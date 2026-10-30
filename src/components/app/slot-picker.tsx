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

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import { MeetingJoinButton } from "@/components/intern/meeting-join";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { formatIst, formatIstClock, formatIstDay, IST_ZONE } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Join opens this long before the start; until then the card says when. */
const JOIN_OPENS_MIN = 15;

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
  // Two steps: select a time, then confirm it. Booking is final (the API
  // refuses a second pick), so one stray tap must not book.
  const [selected, setSelected] = useState<number | null>(null);
  const [booked, setBooked] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function book(slot: number) {
    setError(null);
    setSending(true);
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
      setBooked(slot);
      startTransition(() => router.refresh());
    } catch {
      setError("You appear to be offline. Your choice was not sent.");
    } finally {
      setSending(false);
    }
  }

  const active = chosen ?? booked;
  const bookedSlot = active ? slots.find((s) => s.index === active) : undefined;
  // "America/New_York" reads as "New York".
  const otherZone =
    timezone && timezone !== IST_ZONE && timezone !== "Asia/Calcutta"
      ? (timezone.split("/").pop() ?? timezone).replace(/_/g, " ")
      : null;

  // One live region for both states, so the booking is announced as it swaps the view.
  const status = (
    <p role="status" className="sr-only">
      {booked && !chosen ? "Booked. The company has your time." : ""}
    </p>
  );

  if (bookedSlot) {
    return (
      <div>
        <Booked iso={bookedSlot.iso} meetUrl={meetUrl} justBooked={Boolean(booked && !chosen)} />
        {status}
      </div>
    );
  }

  const choosable = slots.filter((s) => !s.passed);
  const pick = slots.find((s) => s.index === selected && !s.passed);

  return (
    <div>
      <p className="text-pretty text-sm text-text-subtle">
        Choose one, then confirm. Times are in India time (IST)
        {otherZone ? `, converted from the company's ${otherZone} time` : ""}.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Offered times">
        {slots.map((slot) => {
          const on = selected === slot.index;
          return (
            <li key={slot.index}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setSelected(slot.index)}
                disabled={Boolean(slot.passed) || sending || pending}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-apple-sm border px-4 py-3 text-left transition-colors duration-150 sm:flex-col sm:items-start sm:gap-1",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  on ? "border-brand-700 bg-brand-50 ring-1 ring-inset ring-brand-700" : "border-ink-200/80 bg-surface-raised hover:border-brand-400",
                  "disabled:cursor-not-allowed disabled:hover:border-ink-200/80",
                  slot.passed && "opacity-50",
                )}
              >
                <span className="nums text-sm text-ink-700">{formatIstDay(slot.iso)}</span>
                <span className="nums text-base font-semibold text-ink-900">
                  {slot.passed ? "Passed" : formatIstClock(slot.iso)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {choosable.length === 0 ? (
        <p className="mt-3 text-sm text-text-subtle">Every offered time has passed. The company can send new ones.</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => pick && book(pick.index)}
            disabled={!pick || sending || pending}
            className={buttonClass({ variant: "primary" })}
          >
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pick ? `Book ${formatIst(pick.iso)}` : "Book this time"}
          </button>
          <p className="text-xs text-text-subtle">
            {pick ? "The company is told straight away. A booked time can't be changed here." : "Select a time above first."}
          </p>
        </div>
      )}

      <p role="alert" className="empty:hidden mt-3 flex items-start gap-2 text-sm text-danger">
        {error ? (
          <>
            <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
            {error}
          </>
        ) : null}
      </p>
      {status}
    </div>
  );
}

/** The booked time, and Join from 15 minutes before it until the link closes. */
function Booked({ iso, meetUrl, justBooked }: { iso: string; meetUrl: string | null; justBooked: boolean }) {
  const opensAt = new Date(iso).getTime() - JOIN_OPENS_MIN * 60_000;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Read the clock after mount so server and client render the same.
    const wait = opensAt - Date.now();
    // setTimeout overflows past ~24.8 days; a page left open that long reloads anyway.
    if (wait > 2 ** 31 - 1) return;
    const t = window.setTimeout(() => setOpen(true), Math.max(0, wait));
    return () => window.clearTimeout(t);
  }, [opensAt]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="nums text-sm font-medium text-ink-900">{formatIst(iso)}</p>
        <p className="mt-1 text-pretty text-sm text-text-subtle">
          {justBooked ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <Check className="size-4 shrink-0" aria-hidden />
              Booked. The company has your time and a calendar invite is on its way.
            </span>
          ) : meetUrl && open ? (
            "Join a few minutes early. The meeting rules open when you press Join."
          ) : meetUrl ? (
            `Join opens at ${formatIstClock(new Date(opensAt))}, ${JOIN_OPENS_MIN} minutes before the start.`
          ) : (
            "The meeting link appears here and in your email before the interview."
          )}
        </p>
      </div>
      {meetUrl && open ? <MeetingJoinButton link={meetUrl} /> : null}
    </div>
  );
}
