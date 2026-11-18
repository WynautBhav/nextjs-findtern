"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { Meter } from "./meter";
import { NudgeButton } from "./nudge-button";
import { shortDateTime } from "@/lib/format";

type Snapshot = {
  total: number;
  online: number;
  alertable: number;
  offline: { userId: string; name: string; rollNo: string | null; alertable: boolean }[];
  at: string;
};

const SHOW_OFFLINE = 6;

/**
 * The drive board: how many of the drive's students are ready (have Findtern
 * open) right now, who is not, and the one action that fixes it. Pushed over
 * Server-Sent Events; the browser's EventSource reconnects on its own, we only
 * show the state. The count is the loudest thing here, the nudge a quiet button.
 */
export function PresenceLive({
  driveId,
  driveTitle,
  showTitle = true,
  endsAt,
  initial,
}: {
  driveId: string;
  driveTitle: string;
  /** Off on the drive's own page, whose heading already names it. */
  showTitle?: boolean;
  endsAt: string;
  initial: Snapshot;
}) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [conn, setConn] = useState<"live" | "reconnecting">("live");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/college/presence/stream?drive=${encodeURIComponent(driveId)}`);
    es.addEventListener("presence", (e) => {
      try {
        setSnap(JSON.parse((e as MessageEvent).data));
        setConn("live");
      } catch {}
    });
    es.onopen = () => setConn("live");
    es.onerror = () => setConn("reconnecting");
    return () => es.close();
  }, [driveId]);

  const offline = showAll ? snap.offline : snap.offline.slice(0, SHOW_OFFLINE);
  const hidden = snap.offline.length - SHOW_OFFLINE;
  const ends = new Date(endsAt);
  // Two "Aarav Sharma"s must be tellable apart before you chase one.
  const seen = new Map<string, number>();
  for (const o of snap.offline) seen.set(o.name, (seen.get(o.name) ?? 0) + 1);
  const dupes = new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
  const everyone = snap.offline.length === 0;

  return (
    <section aria-labelledby="live-drive" className="rounded-lg border border-ink-200 bg-surface-raised">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-ink-200 px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Pill tone="live" icon={<span aria-hidden className="size-1.5 rounded-full bg-brand-700" />}>Live</Pill>
          {showTitle ? (
            <h2 id="live-drive" className="min-w-0 truncate font-display text-lg font-semibold text-ink-900">
              <Link href={`/college/drives/${driveId}`} className="hover:text-brand-700">
                {driveTitle}
              </Link>
            </h2>
          ) : (
            <h2 id="live-drive" className="sr-only">{driveTitle}, live</h2>
          )}
          <span className="text-sm text-ink-600">
            closes {shortDateTime(ends, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        <span aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-ink-600">
          <Radio className="size-3.5" aria-hidden />
          {conn === "live" ? "Updating live" : "Reconnecting…"}
        </span>
      </div>

      <div className="grid gap-x-12 gap-y-6 px-5 py-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div>
          <p className="text-sm font-medium text-ink-600">Ready right now</p>
          <p className="nums mt-1 font-display text-4xl font-semibold leading-none text-ink-900" aria-live="polite">
            {snap.online}
            <span className="text-2xl text-ink-600">/{snap.total}</span>
          </p>
          <Meter value={snap.online} max={snap.total} label="Students ready" className="mt-4" />
          <p className="nums mt-2 text-sm font-medium text-ink-900">
            {snap.online} of {snap.total} {snap.total === 1 ? "student is" : "students are"} ready
          </p>
          <p className="mt-1 max-w-sm text-sm text-ink-700">
            {everyone
              ? "Every eligible student has Findtern open. Nobody to chase."
              : snap.alertable === 0
                ? "A student is ready once Findtern is open on their phone or laptop. None of the rest has call alerts on, so a nudge reaches them when they next open Findtern."
                : snap.alertable === snap.offline.length
                  ? "A student is ready once Findtern is open. All of the rest have call alerts on: a nudge reaches their phone now."
                  : `A student is ready once Findtern is open. ${snap.alertable} of the rest get a nudge on their phone now; the others when they next open Findtern.`}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 pb-2">
            <h3 className="text-sm font-semibold text-ink-900">
              {everyone ? "Everyone is ready" : `Not ready (${snap.offline.length})`}
            </h3>
            {!everyone ? (
              <NudgeButton
                kind="online"
                userIds={snap.offline.map((o) => o.userId)}
                label={snap.offline.length === 1 ? "Nudge" : `Nudge all ${snap.offline.length}`}
                emphasis
              />
            ) : null}
          </div>
          {!everyone ? (
            <>
              <ul className="divide-y divide-ink-200">
                {offline.map((o) => (
                  <li key={o.userId}>
                    <Link
                      href={`/college/students/${o.userId}`}
                      className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-ink-900 hover:text-brand-700"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {o.name || "Unnamed student"}
                        {dupes.has(o.name) && o.rollNo ? <span className="nums ml-2 font-normal text-ink-600">{o.rollNo}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-ink-600">{o.alertable ? "Call alerts on" : "Call alerts off"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {hidden > 0 ? (
                <button
                  type="button"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700"
                >
                  {showAll ? "Show fewer" : `Show all ${snap.offline.length}`}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
