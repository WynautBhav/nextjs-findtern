"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { NudgeButton } from "./nudge-button";
import { shortDateTime } from "@/lib/format";

type Snapshot = {
  total: number;
  online: number;
  alertable: number;
  offline: { userId: string; name: string; rollNo: string | null; alertable: boolean }[];
  at: string;
};

const SHOW_OFFLINE = 12;

/**
 * "490/500 online" for a live drive, pushed over Server-Sent Events. The
 * browser's EventSource reconnects on its own; we only show the state.
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

  const pct = snap.total ? Math.round((snap.online / snap.total) * 100) : 0;
  const offline = showAll ? snap.offline : snap.offline.slice(0, SHOW_OFFLINE);
  const ends = new Date(endsAt);
  // Two "Aarav Sharma"s must be tellable apart before you chase one.
  const seen = new Map<string, number>();
  for (const o of snap.offline) seen.set(o.name, (seen.get(o.name) ?? 0) + 1);
  const dupes = new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));

  return (
    <section aria-labelledby="live-drive" className="apple-panel overflow-hidden bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full rounded-full bg-brand-500 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-600" />
            </span>
            Drive live
          </p>
          {showTitle ? (
            <h2 id="live-drive" className="mt-1 text-lg font-semibold tracking-[-0.02em] text-ink-900">
              <Link href={`/college/drives/${driveId}`} className="hover:text-brand-700">
                {driveTitle}
              </Link>
            </h2>
          ) : (
            <h2 id="live-drive" className="sr-only">{driveTitle}, live</h2>
          )}
          <p className="mt-0.5 text-sm text-text-subtle">
            Open until {shortDateTime(ends, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <Pill tone={conn === "live" ? "live" : "waiting"}>
          <span aria-live="polite" className="inline-flex items-center gap-1.5">
          <Radio className="size-3.5" aria-hidden />
          {conn === "live" ? "Updating live" : "Reconnecting…"}
          </span>
        </Pill>
      </div>

      <div className="grid gap-6 px-5 py-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div>
          <p className="nums text-4xl font-bold leading-none tracking-[-0.03em] text-ink-900" aria-live="polite">
            {snap.online}
            <span className="text-2xl font-semibold text-ink-600">/{snap.total}</span>
          </p>
          <p className="mt-2 text-sm text-text-subtle">eligible students with Findtern open now</p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={snap.total}
            aria-valuenow={snap.online}
            aria-label="Students online"
          >
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
          {snap.offline.length > 0 ? (
            <p className="mt-3 text-sm text-ink-700">
              {/* Said plainly; it read "0 more can get a phone alert; 35 only see…". */}
              {snap.alertable === 0
                ? "None of them has call alerts on, so a nudge reaches them when they next open Findtern."
                : snap.alertable === snap.offline.length
                  ? "All of them have call alerts on: a nudge reaches their phone now."
                  : `${snap.alertable} of them get a nudge on their phone now; the rest when they next open Findtern.`}
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink-900">
              {snap.offline.length === 0 ? "Everyone is online" : `Offline (${snap.offline.length})`}
            </h3>
            {snap.offline.length > 0 ? (
              <NudgeButton
                kind="online"
                userIds={snap.offline.map((o) => o.userId)}
                label={snap.offline.length === 1 ? "Nudge" : `Nudge all ${snap.offline.length}`}
                emphasis
              />
            ) : null}
          </div>
          {snap.offline.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {offline.map((o) => (
                <li key={o.userId}>
                  <Link
                    href={`/college/students/${o.userId}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 px-3 text-sm text-ink-800 hover:border-ink-300 hover:bg-white"
                    title={o.alertable ? "Has phone alerts on" : "No phone alerts"}
                  >
                    {o.name || "Unnamed student"}
                    {dupes.has(o.name) && o.rollNo ? <span className="nums text-ink-600">{o.rollNo}</span> : null}
                    {o.alertable ? <span className="sr-only">(phone alerts on)</span> : null}
                  </Link>
                </li>
              ))}
              {snap.offline.length > SHOW_OFFLINE ? (
                <li>
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
                  >
                    {showAll ? "Show fewer" : `+${snap.offline.length - SHOW_OFFLINE} more`}
                  </button>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-text-subtle">Nobody to chase right now.</p>
          )}
        </div>
      </div>
    </section>
  );
}
