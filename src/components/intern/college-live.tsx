"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Phone, PhoneOff, Radio, Video, X } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { HEARTBEAT_MS } from "@/lib/college/constants";
import { cn } from "@/lib/utils";
import { PushToggle } from "./college-push";

/**
 * A college member's live link to their placement drive.
 *
 * Every HEARTBEAT_MS the open tab tells the server "still here", which is what
 * the placement officer's "490/500 online" counts. A backgrounded tab keeps
 * beating (the browser throttles it, the 75 s online window absorbs that).
 * The reply carries the live drive and any call requests, so there is no
 * second poll and no open stream per student. A push, when one arrives while
 * the tab is open, triggers an immediate beat so the request shows at once.
 */

type Drive = { id: string; title: string; endsAt: string };
type Meeting = {
  id: string;
  startsAt: string;
  status: string;
  meetingLink: string | null;
  company?: string;
  driveTitle?: string;
};

function whenLabel(startsAt: string, now: number): string {
  const mins = Math.round((new Date(startsAt).getTime() - now) / 60_000);
  if (mins <= 0) return "now";
  return `in ${mins} min`;
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function CollegeLive({ collegeName, vapidKey }: { collegeName: string; vapidKey: string }) {
  const [drive, setDrive] = useState<Drive | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const stopped = useRef(false);

  const beat = useCallback(async () => {
    if (stopped.current) return;
    try {
      const res = await csrfFetch("/api/intern/college/heartbeat", { method: "POST" });
      if (res.status === 401 || res.status === 403) {
        stopped.current = true; // signed out or no longer an intern; stop quietly
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { drive: Drive | null; meetings: Meeting[] };
      setDrive(body.drive);
      setMeetings(body.meetings ?? []);
      setNow(Date.now());
    } catch {
      // Offline for a moment: the next beat retries.
    }
  }, []);

  useEffect(() => {
    // First beat right after mount (a timer, so the state update lands outside the effect body).
    const first = setTimeout(beat, 0);
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === "findtern-refresh") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [beat]);

  // Keep "in 4 min" honest between beats.
  useEffect(() => {
    if (meetings.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [meetings.length]);

  const visible = meetings.filter((m) => !dismissed.has(m.id));
  const current = visible[0] ?? null;

  return (
    <>
      {drive ? (
        <div
          role="status"
          className="mb-6 flex flex-col gap-3 rounded-apple-lg border border-brand-200 bg-brand-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="relative mt-1.5 flex size-2.5 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
            </span>
            <p className="min-w-0 text-sm leading-relaxed text-brand-950">
              <strong className="font-semibold">
                {collegeName}: {drive.title} is live.
              </strong>{" "}
              Employers in the drive can ask you for a call: keep Findtern open, or turn on call alerts. Open until{" "}
              {new Date(drive.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.
            </p>
          </div>
          <PushToggle vapidKey={vapidKey} className="shrink-0" />
        </div>
      ) : null}

      {current ? (
        <CallCard
          key={current.id}
          meeting={current}
          now={now}
          more={visible.length - 1}
          onAnswered={(m) => setMeetings((list) => list.map((x) => (x.id === m.id ? { ...x, ...m } : x)))}
          onGone={(id) => setMeetings((list) => list.filter((x) => x.id !== id))}
          onDismiss={(id) => setDismissed((d) => new Set(d).add(id))}
        />
      ) : null}
    </>
  );
}

function CallCard({
  meeting,
  now,
  more,
  onAnswered,
  onGone,
  onDismiss,
}: {
  meeting: Meeting;
  now: number;
  more: number;
  onAnswered: (m: Meeting) => void;
  onGone: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const ids = useId();
  const acceptRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accepted = meeting.status === "accepted";
  const company = meeting.company ?? "An employer";

  // An incoming request takes focus, unless the student is typing somewhere.
  useEffect(() => {
    if (accepted) return;
    const el = document.activeElement;
    const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable;
    if (!typing) acceptRef.current?.focus({ preventScroll: true });
  }, [accepted]);

  async function answer(action: "accept" | "decline") {
    setBusy(action);
    setError(null);
    try {
      const res = await csrfFetch(`/api/intern/college/meetings/${meeting.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as { meeting?: Meeting; error?: string };
      if (res.status === 409 || res.status === 404) {
        setError(body.error ?? "This request has already closed.");
        setTimeout(() => onGone(meeting.id), 2500);
        return;
      }
      if (!res.ok || !body.meeting) {
        setError(body.error ?? "Couldn't send your answer. Try again.");
        return;
      }
      if (action === "decline") onGone(meeting.id);
      else onAnswered(body.meeting);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={`${ids}-title`}
      aria-describedby={`${ids}-desc`}
      className={cn(
        // Above the chat launcher (z-80): an incoming call outranks it.
        "fixed inset-x-3 z-[90] rounded-apple-xl border bg-white p-4 shadow-[0_12px_40px_rgb(7_47_36/0.18)]",
        "bottom-[calc(5.25rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-auto lg:right-6 lg:w-[24rem]",
        "motion-safe:animate-[ft-call-in_240ms_cubic-bezier(0.16,1,0.3,1)]",
        accepted ? "border-brand-300" : "border-accent-300",
      )}
    >
      <style>{`@keyframes ft-call-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }`}</style>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full",
            accepted ? "bg-brand-50 text-brand-700" : "bg-accent-100 text-accent-800",
          )}
        >
          {accepted ? <Video className="size-5" /> : <Radio className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p id={`${ids}-title`} className="text-[0.9375rem] font-semibold leading-snug text-ink-900">
            {accepted ? `Call with ${company}` : `${company} wants to talk ${whenLabel(meeting.startsAt, now)}`}
          </p>
          <p id={`${ids}-desc`} className="mt-0.5 text-sm leading-relaxed text-ink-600">
            {accepted
              ? `Starts ${whenLabel(meeting.startsAt, now) === "now" ? "now" : `at ${clock(meeting.startsAt)}`}. About 20 minutes on video.`
              : `${meeting.driveTitle ?? "Campus drive"}. A short video call. Reply by ${clock(new Date(new Date(meeting.startsAt).getTime() + 10 * 60_000).toISOString())} or it lapses.`}
          </p>
        </div>
        {accepted ? (
          <button
            type="button"
            onClick={() => onDismiss(meeting.id)}
            aria-label="Close"
            className="-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-apple-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {accepted ? (
          meeting.meetingLink ? (
            <a
              href={meeting.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-apple-md bg-primary px-4 text-[0.9375rem] font-semibold text-white hover:bg-primary-hover"
            >
              <Video className="size-4" aria-hidden />
              Join call
            </a>
          ) : (
            <p className="col-span-2 text-sm text-ink-600">The call link isn&apos;t ready yet. It will appear here and in your notifications.</p>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={() => answer("decline")}
              disabled={busy !== null}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-apple-md border border-ink-200 bg-white px-4 text-[0.9375rem] font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-60"
            >
              <PhoneOff className="size-4" aria-hidden />
              {busy === "decline" ? "Declining…" : "Decline"}
            </button>
            <button
              ref={acceptRef}
              type="button"
              onClick={() => answer("accept")}
              disabled={busy !== null}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-apple-md bg-primary px-4 text-[0.9375rem] font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              <Phone className="size-4" aria-hidden />
              {busy === "accept" ? "Accepting…" : "Accept"}
            </button>
          </>
        )}
      </div>

      {more > 0 ? (
        <p className="mt-3 text-center text-sm text-ink-600">
          {more} more request{more === 1 ? "" : "s"} after this one
        </p>
      ) : null}
    </div>
  );
}
