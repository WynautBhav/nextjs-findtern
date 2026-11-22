"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";

import { SURFACE_CLASS } from "@/components/app/primitives";
import { cn } from "@/lib/utils";
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
 * "490/500 online" for a live drive, pushed over Server-Sent Events. The
 * browser's EventSource reconnects on its own; we only show the state.
 */
export function PresenceLive({
  driveId,
  driveTitle,
  showTitle = true,
  startsAt,
  endsAt,
  initial,
}: {
  driveId: string;
  driveTitle: string;
  /** Off on the drive's own page, whose heading already names it. */
  showTitle?: boolean;
  /** Draws the drive's timeline when given. */
  startsAt?: string;
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

  // The clock starts at the snapshot's own time, so the server and the first client render agree.
  const [now, setNow] = useState(() => Date.parse(initial.at));
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const offline = showAll ? snap.offline : snap.offline.slice(0, SHOW_OFFLINE);
  const ends = new Date(endsAt);
  const starts = startsAt ? new Date(startsAt) : null;
  const left = Math.max(0, ends.getTime() - now);
  const elapsed = starts ? Math.min(1, Math.max(0, (now - starts.getTime()) / Math.max(1, ends.getTime() - starts.getTime()))) : null;
  const alertOff = snap.offline.filter((o) => o.alertable);
  const quiet = snap.offline.filter((o) => !o.alertable);
  // Two "Aarav Sharma"s must be tellable apart before you chase one.
  const seen = new Map<string, number>();
  for (const o of snap.offline) seen.set(o.name, (seen.get(o.name) ?? 0) + 1);
  const dupes = new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
  const fmt = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  // A hall of seats: one square per eligible student, online first. Offline squares carry the name on hover.
  const dot = snap.total > 400 ? "size-2 rounded-[2px]" : snap.total > 160 ? "size-3 rounded-[3px]" : "size-4 rounded-[4px]";

  return (
    <section aria-labelledby="live-drive" className={`overflow-hidden ${SURFACE_CLASS}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-700">
            <span aria-hidden className="size-2 rounded-full bg-brand-600" />
            Drive live
          </p>
          {showTitle ? (
            <h2 id="live-drive" className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink-900">
              <Link href={`/college/drives/${driveId}`} className="hover:underline hover:underline-offset-4">
                {driveTitle}
              </Link>
            </h2>
          ) : (
            <h2 id="live-drive" className="sr-only">{driveTitle}, live</h2>
          )}
        </div>
        <span aria-live="polite" className={cn("inline-flex items-center gap-1.5 text-xs", conn === "live" ? "text-ink-600" : "text-accent-700")}>
          <Radio className="size-3.5" aria-hidden />
          {conn === "live" ? "Updating live" : "Reconnecting…"}
        </span>
      </div>

      <div className="grid gap-x-10 gap-y-6 px-5 py-5 lg:grid-cols-[13rem_minmax(0,1fr)_15rem]">
        {/* Who is here. */}
        <div>
          <p className="text-xs text-text-subtle">Online now</p>
          <p className="nums mt-1 leading-none" aria-live="polite">
            <span className="text-[2.5rem] font-medium tracking-[-0.03em] text-ink-900">{snap.online}</span>
            <span className="text-xl text-ink-500"> / {snap.total}</span>
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            {[
              { label: "Online", n: snap.online, cls: "bg-brand-600" },
              { label: "Offline, phone alerts on", n: alertOff.length, cls: "bg-ink-500" },
              { label: "Offline, no alerts", n: quiet.length, cls: "bg-ink-200" },
            ].map((l) => (
              <li key={l.label} className="flex items-center gap-2">
                <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", l.cls)} />
                <span className="min-w-0 flex-1 truncate text-ink-700">{l.label}</span>
                <span className="nums font-medium text-ink-900">{l.n}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <div
            role="img"
            aria-label={`${snap.online} of ${snap.total} eligible students online; ${alertOff.length} offline with phone alerts, ${quiet.length} offline without.`}
            className="flex flex-wrap content-start gap-[3px]"
          >
            {Array.from({ length: snap.online }, (_, i) => (
              <span key={`on${i}`} className={cn(dot, "bg-brand-600")} />
            ))}
            {alertOff.map((o) => (
              <span key={o.userId} title={o.name} className={cn(dot, "bg-ink-500")} />
            ))}
            {quiet.map((o) => (
              <span key={o.userId} title={o.name} className={cn(dot, "bg-ink-200")} />
            ))}
          </div>
          {snap.offline.length > 0 ? (
            <p className="mt-3 text-sm text-ink-700">
              {/* Said plainly; it read "0 more can get a phone alert; 35 only see…". */}
              {snap.alertable === 0
                ? "None of the offline students has call alerts on, so a nudge reaches them when they next open Findtern."
                : snap.alertable === snap.offline.length
                  ? "Every offline student has call alerts on: a nudge reaches their phone now."
                  : `${snap.alertable} offline students get a nudge on their phone now; the rest when they next open Findtern.`}
            </p>
          ) : null}
        </div>

        {/* How long is left, and the one thing to do. */}
        <div className="flex flex-col">
          <p className="text-xs text-text-subtle">Time left</p>
          <p className="nums mt-1 text-[1.75rem] font-medium leading-none tracking-[-0.02em] text-ink-900">{left > 0 ? timeLeft(left) : "Ended"}</p>
          {elapsed !== null && starts ? (
            <div className="mt-4">
              <div className="relative h-1.5 rounded-full bg-ink-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed * 100)} aria-label="Drive time gone">
                <div className="h-full rounded-full bg-ink-800" style={{ width: `${elapsed * 100}%` }} />
                <span aria-hidden className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink-900" style={{ left: `${elapsed * 100}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-text-subtle">
                <span>{fmt(starts)}</span>
                <span>{fmt(ends)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-text-subtle">Open until {fmt(ends)}</p>
          )}
          {snap.offline.length > 0 ? (
            <div className="mt-auto pt-5">
              <NudgeButton
                kind="online"
                userIds={snap.offline.map((o) => o.userId)}
                label={snap.offline.length === 1 ? "Nudge the offline student" : `Nudge all ${snap.offline.length} offline`}
                size="sm"
                className="w-full justify-center border-ink-900 bg-ink-900 text-white hover:border-ink-800 hover:bg-ink-800 [&_svg]:text-white"
              />
            </div>
          ) : null}
        </div>
      </div>

      {snap.offline.length > 0 ? (
        <div className="border-t border-ink-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-ink-900">Offline <span className="nums font-normal text-text-subtle">{snap.offline.length}</span></h3>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {offline.map((o) => (
              <li key={o.userId}>
                <Link
                  href={`/college/students/${o.userId}`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 text-sm text-ink-800 hover:border-ink-400 max-lg:min-h-11"
                  title={o.alertable ? "Has phone alerts on" : "No phone alerts"}
                >
                  <span aria-hidden className={cn("size-1.5 rounded-full", o.alertable ? "bg-ink-500" : "bg-ink-200")} />
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
                  className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-ink-800 underline underline-offset-4 hover:text-ink-900 max-lg:min-h-11"
                >
                  {showAll ? "Show fewer" : `+${snap.offline.length - SHOW_OFFLINE} more`}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <p className="border-t border-ink-100 px-5 py-4 text-sm text-text-subtle">Everyone is online. Nobody to chase right now.</p>
      )}
    </section>
  );
}

/** "5 days 3 h", "3 h 20 min", "20 min". */
function timeLeft(ms: number) {
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d > 0) return `${d} ${d === 1 ? "day" : "days"} ${h} h`;
  if (h > 0) return `${h} h ${min % 60} min`;
  return `${Math.max(1, min)} min`;
}
