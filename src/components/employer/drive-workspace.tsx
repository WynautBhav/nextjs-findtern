"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyScene, Surface } from "@/components/app/primitives";
import { useConfirm } from "@/components/app/use-confirm";
import { CallsPanel } from "@/components/employer/drive/calls-panel";
import { CandidateRow } from "@/components/employer/drive/candidate-row";
import { FilterBar } from "@/components/employer/drive/filters";
import { YEAR_LABEL, type DriveCandidate } from "@/components/employer/drive/shared";
import { csrfFetch } from "@/lib/client-fetch";
import type { MeetingView } from "@/lib/college/meetings";

export type { DriveCandidate };

const POLL_MS = 10_000;

export function DriveWorkspace({
  driveId,
  fullTime,
  candidates,
  initialMeetings,
}: {
  driveId: string;
  fullTime: boolean;
  candidates: DriveCandidate[];
  initialMeetings: MeetingView[];
}) {
  const [q, setQ] = useState("");
  const [minScore, setMinScore] = useState(0);
  const { ask, dialog: confirmDialog } = useConfirm();
  const [year, setYear] = useState<number | 0>(0);
  const [branch, setBranch] = useState("");
  const [onlyShortlisted, setOnlyShortlisted] = useState(false);
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [shortlist, setShortlist] = useState(() => new Set(candidates.filter((c) => c.shortlisted).map((c) => c.id)));
  const [meetings, setMeetings] = useState<MeetingView[]>(initialMeetings);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [locked, setLocked] = useState(false);
  const callsHeadingRef = useRef<HTMLHeadingElement>(null);

  const years = useMemo(() => [...new Set(candidates.map((c) => c.year).filter((y): y is number => y !== null))].sort(), [candidates]);
  const branches = useMemo(
    () => [...new Set(candidates.map((c) => c.branch).filter((b): b is string => Boolean(b)))].sort((a, b) => a.localeCompare(b)),
    [candidates],
  );
  // Calls panel: initials alone can't tell three "AS"s apart.
  const nameOf = useMemo(
    () =>
      new Map(
        candidates.map((c) => [
          c.id,
          [c.name, c.year ? YEAR_LABEL(c.year) : null, c.branch, c.score !== null ? `score ${c.score.toFixed(1)}` : null].filter(Boolean).join(" · "),
        ]),
      ),
    [candidates],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates
      .filter((c) => {
        if (onlyShortlisted && !shortlist.has(c.id)) return false;
        if (onlyOnline && !c.online) return false;
        if (minScore > 0 && (c.score === null || c.score < minScore)) return false;
        if (year && c.year !== year) return false;
        if (branch && c.branch !== branch) return false;
        if (needle && !c.skills.some((s) => s.toLowerCase().includes(needle)) && !(c.branch ?? "").toLowerCase().includes(needle)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const key = (c: DriveCandidate) => (fullTime ? (c.cgpa ?? -1) : (c.score ?? -1));
        return Number(b.online) - Number(a.online) || key(b) - key(a) || (b.score ?? -1) - (a.score ?? -1);
      });
  }, [candidates, q, minScore, year, branch, onlyShortlisted, onlyOnline, shortlist, fullTime]);

  /** The open (or most recent) call per candidate, so the card can show it. */
  const callFor = useMemo(() => {
    const m = new Map<string, MeetingView>();
    for (const row of meetings) if (!m.has(row.userId)) m.set(row.userId, row);
    return m;
  }, [meetings]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/employer/drives/${driveId}/meetings`, { cache: "no-store" });
      if (res.status === 403) {
        setLocked(true);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { meetings: MeetingView[] };
      setMeetings(data.meetings);
    } catch {
      // Offline for a moment; the next tick retries.
    }
  }, [driveId]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (!timer) timer = setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void refresh();
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  async function toggleShortlist(id: string) {
    const on = !shortlist.has(id);
    setShortlist((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    const res = await csrfFetch(`/api/employer/drives/${driveId}/shortlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: id, on }),
    }).catch(() => null);
    if (!res?.ok) {
      setShortlist((prev) => {
        const next = new Set(prev);
        if (on) next.delete(id);
        else next.add(id);
        return next;
      });
      if (res?.status === 403) setLocked(true);
      setNotice({ tone: "error", text: "Couldn't update the shortlist. Try again." });
    }
  }

  const [manualLink, setManualLink] = useState("");

  async function requestCall(id: string, inMinutes: number) {
    setNotice(null);
    const res = await csrfFetch(`/api/employer/drives/${driveId}/meetings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: id, inMinutes, manualLink }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { meeting?: MeetingView; error?: string } | undefined;
    if (!res?.ok || !data?.meeting) {
      if (res?.status === 403) setLocked(true);
      setNotice({ tone: "error", text: data?.error ?? "Couldn't send the call request. Try again." });
      return;
    }
    setMeetings((prev) => [data.meeting!, ...prev]);
    setNotice({
      tone: "ok",
      text: `Call request sent to ${nameOf.get(id) ?? "the student"}. They get a notification now; the join link appears here once they accept.`,
    });
  }

  async function cancelCall(meetingId: string) {
    const name = nameOf.get(meetings.find((m) => m.id === meetingId)?.userId ?? "") ?? "this student";
    const ok = await ask({
      title: `Cancel the call with ${name}?`,
      body: "They are told the call is off. To talk later, send a new call request.",
      confirmLabel: "Yes, cancel the call",
      cancelLabel: "Keep the call",
    });
    if (!ok) return;
    setNotice(null);
    const res = await csrfFetch(`/api/employer/drives/${driveId}/meetings?meeting=${encodeURIComponent(meetingId)}`, {
      method: "DELETE",
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { meeting?: MeetingView; error?: string } | undefined;
    if (!res?.ok || !data?.meeting) {
      if (res?.status === 403) setLocked(true);
      setNotice({ tone: "error", text: data?.error ?? "Couldn't cancel the call. Try again." });
      return;
    }
    setMeetings((prev) => prev.map((m) => (m.id === meetingId ? data.meeting! : m)));
    setNotice({ tone: "ok", text: "Call cancelled. The student no longer sees the request." });
    // The Cancel button is gone now; keep focus in the panel instead of dropping to <body>.
    callsHeadingRef.current?.focus();
  }

  if (locked) {
    return (
      <Surface className="p-6" role="alert">
        <p className="font-semibold text-ink-900">This drive is no longer open to you</p>
        <p className="mt-1 text-sm text-ink-600">The drive has ended or the college closed its link. Reload to see the details.</p>
      </Surface>
    );
  }

  const filtersActive = q || minScore || year || branch || onlyShortlisted || onlyOnline;
  const onlineCount = candidates.filter((c) => c.online).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <div className="min-w-0">
        <FilterBar
          f={{ q, minScore, year, branch, onlyShortlisted, onlyOnline }}
          patch={(p) => {
            if (p.q !== undefined) setQ(p.q);
            if (p.minScore !== undefined) setMinScore(p.minScore);
            if (p.year !== undefined) setYear(p.year);
            if (p.branch !== undefined) setBranch(p.branch);
            if (p.onlyShortlisted !== undefined) setOnlyShortlisted(p.onlyShortlisted);
            if (p.onlyOnline !== undefined) setOnlyOnline(p.onlyOnline);
          }}
          years={years}
          branches={branches}
          shortlistCount={shortlist.size}
          onlineCount={onlineCount}
          shown={visible.length}
          total={candidates.length}
          active={Boolean(filtersActive)}
          yearLabel={YEAR_LABEL}
          onClear={() => {
            setQ("");
            setMinScore(0);
            setYear(0);
            setBranch("");
            setOnlyShortlisted(false);
            setOnlyOnline(false);
          }}
        />

        {notice?.tone === "error" ? (
          <p role="alert" className="mt-4 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
            {notice.text}
          </p>
        ) : null}
        {/* Always mounted, so a success is announced when it fills in. */}
        <p role="status" className={notice?.tone === "ok" ? "mt-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800" : "sr-only"}>
          {notice?.tone === "ok" ? notice.text : null}
        </p>

        {candidates.length === 0 ? (
          <Surface className="mt-4 rounded-[24px]">
            <EmptyScene
              compact
              title="No students in this drive yet"
              body="Students appear here as they join Findtern and agree to be shown in drives."
              who="The college - decides who is eligible"
            />
          </Surface>
        ) : visible.length === 0 ? (
          <Surface className="mt-4 rounded-[24px]">
            <EmptyScene
              compact
              title="No students match these filters"
              body="Loosen a filter or clear them to see everyone in the drive."
            />
          </Surface>
        ) : (
          // One column beside the 20rem aside at xl: two left ~86px for the name next to Shortlist.
          <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {visible.map((c) => (
              <CandidateRow
                key={c.id}
                c={c}
                fullTime={fullTime}
                shortlisted={shortlist.has(c.id)}
                call={callFor.get(c.id)}
                onShortlist={() => toggleShortlist(c.id)}
                onCall={(m) => requestCall(c.id, m)}
              />
            ))}
          </ul>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-3">
      <div className="flex flex-col gap-1 rounded-[24px] border border-ink-200/70 bg-white p-4 shadow-tile">
        <label htmlFor="manual-link" className="text-sm font-medium text-ink-900">
          Your own meeting link (optional)
        </label>
        <input
          id="manual-link"
          type="url"
          inputMode="url"
          value={manualLink}
          onChange={(e) => setManualLink(e.target.value)}
          placeholder="https://meet.google.com/… Leave empty to get one from Findtern"
          className="min-h-11 w-full min-w-0 rounded-lg border border-ink-200 bg-white px-3 text-base text-ink-900 focus-visible:outline-2 focus-visible:outline-brand-600"
        />
      </div>
      <CallsPanel meetings={meetings} nameOf={nameOf} onCancel={cancelCall} headingRef={callsHeadingRef} />
      </aside>
      {confirmDialog}
    </div>
  );
}

