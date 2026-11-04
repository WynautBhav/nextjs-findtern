"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Phone, Plus, Search, Video, X } from "lucide-react";

import { Pill, Surface, type Tone } from "@/components/app/primitives";
import { ScoreBar } from "@/components/app/score-bar";
import { useConfirm } from "@/components/app/use-confirm";
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
import { fieldClass } from "@/components/employer/ui-tokens";

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
const SKILLS_SHOWN = 8;
const SKILL_CHIP = "rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700";

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
        {/* Filters */}
        <Surface className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
            <label className="relative block">
              <span className="sr-only">Search skills or branch</span>
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Skill or branch, e.g. React"
                className={cn(fieldClass, "pl-9")}
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
          // One column beside the 20rem aside at xl: two left ~86px for the name next to Shortlist.
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
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

      <div className="mt-4 flex flex-col gap-1">
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
          className="min-h-11 w-full min-w-0 rounded-lg border border-ink-200 bg-white px-3 text-base text-ink-900"
        />
      </div>
      <CallsPanel meetings={meetings} nameOf={nameOf} onCancel={cancelCall} headingRef={callsHeadingRef} />
      {confirmDialog}
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
        className={cn(fieldClass, "appearance-none pr-9")}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
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
          <p className="flex min-w-0 flex-wrap items-center gap-x-2">
            <span className="min-w-0 break-words font-semibold text-ink-900">{c.name}</span>
            {c.online ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-800">
                <span className="size-1.5 rounded-full bg-brand-600" aria-hidden />
                Online
              </span>
            ) : null}
          </p>
          <p className="break-words text-sm text-ink-600">{meta || "Year and branch not given"}</p>
        </div>
        <button
          type="button"
          onClick={onShortlist}
          aria-pressed={shortlisted}
          aria-label={`Shortlist ${c.name}`}
          className={cn(
            "apple-spring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
            shortlisted ? "border-brand-200 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
          )}
        >
          {shortlisted ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          Shortlist
        </button>
      </div>

      <div className={cn("mt-4 grid gap-4", fullTime ? "grid-cols-2" : "grid-cols-1")}>
        <div>
          <div className="flex items-baseline justify-between text-xs font-medium text-text-subtle">
            <span>Findtern Score</span>
            {c.score !== null ? <span className="nums text-sm font-semibold text-ink-900">{c.score.toFixed(1)}</span> : null}
          </div>
          {c.score !== null ? <ScoreBar value={c.score} /> : <p className="mt-1 text-sm text-text-subtle">AI interview not taken yet</p>}
        </div>
        {fullTime ? (
          <div>
            <p className="text-xs font-medium text-text-subtle">CGPA</p>
            <p className="nums mt-0.5 text-sm font-semibold text-ink-900">{c.cgpa !== null ? c.cgpa.toFixed(1) : "Not given"}</p>
          </div>
        ) : null}
      </div>

      {c.skills.length ? (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Skills">
          {c.skills.slice(0, SKILLS_SHOWN).map((s) => (
            <li key={s} className={SKILL_CHIP}>
              {s}
            </li>
          ))}
        </ul>
      ) : null}
      {c.skills.length > SKILLS_SHOWN ? (
        <details className="mt-1.5">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-brand-700">
            +{c.skills.length - SKILLS_SHOWN} more
          </summary>
          <ul className="flex flex-wrap gap-1.5" aria-label="More skills">
            {c.skills.slice(SKILLS_SHOWN).map((s) => (
              <li key={s} className={SKILL_CHIP}>
                {s}
              </li>
            ))}
          </ul>
        </details>
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
            // Arrives by poll when the candidate accepts; fade in so it is noticed, not teleported.
            className={cn(buttonVariants({ size: "sm" }), "starting:scale-[0.97] starting:opacity-0")}
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
  headingRef,
}: {
  meetings: MeetingView[];
  nameOf: Map<string, string>;
  onCancel: (id: string) => Promise<void>;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <Surface as="section" aria-labelledby="calls-title" className="xl:sticky xl:top-24">
      <div className="border-b border-ink-100 px-4 py-3.5">
        <h2 id="calls-title" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-ink-900">
          Your calls
        </h2>
        <p className="mt-0.5 text-xs text-ink-600">Updates every few seconds. A request lapses 10 minutes after its start time.</p>
        {/* Always mounted; announces only when the number of calls changes, not on every poll. */}
        <p role="status" className="sr-only">
          {meetings.length} {meetings.length === 1 ? "call" : "calls"}
        </p>
      </div>
      {meetings.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-600">
          No calls yet. Use <span className="font-medium text-ink-800">Call</span> on a student to ask for a quick video chat.
        </p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-ink-100 overflow-y-auto">
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
                    aria-label={`Cancel call with ${nameOf.get(m.userId) ?? "student"}`}
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
