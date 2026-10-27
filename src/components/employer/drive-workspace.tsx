"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Phone, Plus, Search, Video, X } from "lucide-react";

import { Pill, Surface, type Tone } from "@/components/app/primitives";
import { ScoreBar } from "@/components/app/score-bar";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { csrfFetch } from "@/lib/client-fetch";
import type { MeetingView } from "@/lib/college/meetings";
import { cn } from "@/lib/utils";

export type DriveCandidate = {
  id: string;
  /** Initials until this company hires them (displayNameOf). */
  name: string;
  initials: string;
  year: number | null;
  branch: string | null;
  /** Only sent for full-time drives. */
  cgpa: number | null;
  score: number | null;
  skills: string[];
  shortlisted: boolean;
  /** Findtern open in the last ~75 s, so a "call now" will be seen. */
  online: boolean;
};

const POLL_MS = 10_000;

const CALL_STATUS: Record<string, { tone: Tone; label: string }> = {
  requested: { tone: "waiting", label: "Waiting for reply" },
  accepted: { tone: "live", label: "Accepted" },
  declined: { tone: "closed", label: "Declined" },
  expired: { tone: "closed", label: "No reply" },
  cancelled: { tone: "closed", label: "Cancelled" },
};

const DELAYS = [
  { minutes: 0, label: "Now" },
  { minutes: 5, label: "In 5 minutes" },
  { minutes: 10, label: "In 10 minutes" },
] as const;

const YEAR_LABEL = (y: number) => `${y}${["st", "nd", "rd"][y - 1] ?? "th"} year`;

function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(
    new Date(iso),
  );
}

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
  const [year, setYear] = useState<number | 0>(0);
  const [branch, setBranch] = useState("");
  const [onlyShortlisted, setOnlyShortlisted] = useState(false);
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [shortlist, setShortlist] = useState(() => new Set(candidates.filter((c) => c.shortlisted).map((c) => c.id)));
  const [meetings, setMeetings] = useState<MeetingView[]>(initialMeetings);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [locked, setLocked] = useState(false);

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

  async function requestCall(id: string, inMinutes: number) {
    setNotice(null);
    const res = await csrfFetch(`/api/employer/drives/${driveId}/meetings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: id, inMinutes }),
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
        {/* Filters */}
        <Surface className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
            <label className="relative block">
              <span className="sr-only">Search skills or branch</span>
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Skill or branch, e.g. React"
                className="h-11 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <Select label="Minimum score" value={String(minScore)} onChange={(v) => setMinScore(Number(v))}>
              <option value="0">Any score</option>
              {[5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>
                  {s}+ score
                </option>
              ))}
            </Select>
            <Select label="Year" value={String(year)} onChange={(v) => setYear(Number(v))}>
              <option value="0">Any year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {YEAR_LABEL(y)}
                </option>
              ))}
            </Select>
            <Select label="Branch" value={branch} onChange={setBranch}>
              <option value="">Any branch</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-700">
              <input
                type="checkbox"
                checked={onlyShortlisted}
                onChange={(e) => setOnlyShortlisted(e.target.checked)}
                className="size-4 rounded border-ink-300 accent-brand-700"
              />
              Shortlisted only ({shortlist.size})
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-700">
              <input
                type="checkbox"
                checked={onlyOnline}
                onChange={(e) => setOnlyOnline(e.target.checked)}
                className="size-4 rounded border-ink-300 accent-brand-700"
              />
              Online now ({onlineCount})
            </label>
            <p className="nums text-sm text-ink-600" aria-live="polite">
              Showing {visible.length} of {candidates.length} students
              {filtersActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    setMinScore(0);
                    setYear(0);
                    setBranch("");
                    setOnlyShortlisted(false);
                    setOnlyOnline(false);
                  }}
                  className="ml-2 inline-flex min-h-11 items-center font-medium text-brand-700 underline-offset-4 hover:underline"
                >
                  Clear filters
                </button>
              ) : null}
            </p>
          </div>
        </Surface>

        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn(
              "mt-4 rounded-lg border px-4 py-3 text-sm",
              notice.tone === "error" ? "border-danger/25 bg-danger-soft text-danger" : "border-brand-200 bg-brand-50 text-brand-800",
            )}
          >
            {notice.text}
          </p>
        ) : null}

        {candidates.length === 0 ? (
          <Surface className="mt-4 p-8 text-center">
            <p className="font-semibold text-ink-900">No students are in this drive yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-600">
              The college decides who is eligible. Students appear here as they join Findtern and agree to be shown in drives.
            </p>
          </Surface>
        ) : visible.length === 0 ? (
          <Surface className="mt-4 p-8 text-center">
            <p className="font-semibold text-ink-900">No students match these filters</p>
            <p className="mt-1 text-sm text-ink-600">Loosen a filter or clear them to see everyone in the drive.</p>
          </Surface>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
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

      <CallsPanel meetings={meetings} nameOf={nameOf} onCancel={cancelCall} />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-ink-200 bg-white pl-3 pr-9 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
    </label>
  );
}

function isOpen(call: MeetingView | undefined): boolean {
  if (!call) return false;
  if (call.status === "requested") return true;
  // An accepted call is "open" until it has had its 20 minutes.
  return call.status === "accepted" && new Date(call.startsAt).getTime() + 20 * 60_000 > Date.now();
}

function CandidateRow({
  c,
  fullTime,
  shortlisted,
  call,
  onShortlist,
  onCall,
}: {
  c: DriveCandidate;
  fullTime: boolean;
  shortlisted: boolean;
  call: MeetingView | undefined;
  onShortlist: () => void;
  onCall: (minutes: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const open = isOpen(call);
  const meta = [c.year ? YEAR_LABEL(c.year) : null, c.branch].filter(Boolean).join(" · ");

  return (
    <Surface as="li" className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <CandidateAvatar initials={c.initials} className="size-11 rounded-xl text-sm" />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-ink-900">{c.name}</span>
            {c.online ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-800">
                <span className="size-1.5 rounded-full bg-brand-600" aria-hidden />
                Online
              </span>
            ) : null}
          </p>
          <p className="truncate text-sm text-ink-600">{meta || "Year and branch not given"}</p>
        </div>
        <button
          type="button"
          onClick={onShortlist}
          aria-pressed={shortlisted}
          aria-label={shortlisted ? `Remove ${c.name} from shortlist` : `Shortlist ${c.name}`}
          className={cn(
            "apple-spring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
            shortlisted ? "border-brand-200 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
          )}
        >
          {shortlisted ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {shortlisted ? "Shortlisted" : "Shortlist"}
        </button>
      </div>

      <div className={cn("mt-4 grid gap-4", fullTime ? "grid-cols-2" : "grid-cols-1")}>
        <div>
          <div className="flex items-baseline justify-between text-xs font-medium text-ink-500">
            <span>Findtern Score</span>
            {c.score !== null ? <span className="nums text-sm font-semibold text-ink-900">{c.score.toFixed(1)}</span> : null}
          </div>
          {c.score !== null ? <ScoreBar value={c.score} /> : <p className="mt-1 text-sm text-ink-500">AI interview not taken yet</p>}
        </div>
        {fullTime ? (
          <div>
            <p className="text-xs font-medium text-ink-500">CGPA</p>
            <p className="nums mt-0.5 text-sm font-semibold text-ink-900">{c.cgpa !== null ? c.cgpa.toFixed(1) : "Not given"}</p>
          </div>
        ) : null}
      </div>

      {c.skills.length ? (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Skills">
          {c.skills.slice(0, 5).map((s) => (
            <li key={s} className="rounded-md bg-ink-100 px-2 py-1 text-xs font-medium text-ink-700">
              {s}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        {call ? (
          <span className="flex min-w-0 items-center gap-2 text-sm text-ink-600">
            <Pill tone={CALL_STATUS[call.status]?.tone ?? "neutral"}>{CALL_STATUS[call.status]?.label ?? "Call"}</Pill>
            <span className="nums truncate">{clock(call.startsAt)}</span>
          </span>
        ) : (
          <span />
        )}
        {open && call?.status === "accepted" && call.meetingLink ? (
          <a
            href={call.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "sm" })}
          >
            <Video className="size-4" aria-hidden />
            Join call
          </a>
        ) : open ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={busy} className={buttonVariants({ size: "sm", variant: "outline" })}>
                {busy ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <Phone className="size-4" aria-hidden />}
                Call
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1.5">
              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-ink-600">
                Video call with {c.name}
                {!c.online ? <span className="mt-0.5 block font-normal">Not online right now: they get a notification, and may not see it at once.</span> : null}
              </DropdownMenuLabel>
              {DELAYS.map((d) => (
                <DropdownMenuItem
                  key={d.minutes}
                  className="min-h-11 cursor-pointer"
                  onSelect={async () => {
                    setBusy(true);
                    await onCall(d.minutes);
                    setBusy(false);
                  }}
                >
                  {d.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Surface>
  );
}

function CallsPanel({
  meetings,
  nameOf,
  onCancel,
}: {
  meetings: MeetingView[];
  nameOf: Map<string, string>;
  onCancel: (id: string) => Promise<void>;
}) {
  return (
    <Surface as="section" aria-labelledby="calls-title" className="xl:sticky xl:top-24">
      <div className="border-b border-ink-100 px-4 py-3.5">
        <h2 id="calls-title" className="text-base font-semibold text-ink-900">
          Your calls
        </h2>
        <p className="mt-0.5 text-xs text-ink-600">Updates every few seconds. A request lapses 10 minutes after its start time.</p>
      </div>
      {meetings.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-600">
          No calls yet. Use <span className="font-medium text-ink-800">Call</span> on a student to ask for a quick video chat.
        </p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-ink-100 overflow-y-auto" aria-live="polite">
          {meetings.map((m) => {
            const s = CALL_STATUS[m.status] ?? { tone: "neutral" as Tone, label: "Call" };
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{nameOf.get(m.userId) ?? "Student"}</p>
                  <p className="nums text-xs text-ink-600">{clock(m.startsAt)}</p>
                </div>
                {m.status === "requested" || m.status === "accepted" ? (
                  <button
                    type="button"
                    onClick={() => onCancel(m.id)}
                    className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                  >
                    Cancel
                  </button>
                ) : null}
                {m.status === "accepted" && m.meetingLink ? (
                  <a
                    href={m.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    <Video className="size-4" aria-hidden />
                    Join
                  </a>
                ) : (
                  <Pill tone={s.tone}>
                    {m.status === "declined" ? <X className="size-3" aria-hidden /> : null}
                    {s.label}
                  </Pill>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}
