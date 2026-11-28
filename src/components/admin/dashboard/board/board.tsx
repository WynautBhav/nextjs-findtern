"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ADMIN_SURFACE } from "@/components/admin/surface";
import {
  BOARD_VIEWS,
  employerMetrics,
  SIZE_UNKNOWN,
  pct,
  funnel,
  stackOf,
  studentMetrics,
  trackCounts,
  type BoardLinks,
  type BoardMeeting,
  type BoardOffer,
  type BoardStudent,
  type MetricList,
  type BoardView,
  type TrackFilter,
} from "@/lib/admin/dashboard-board-pure";
import type { BoardCollege, DashboardBoard } from "@/lib/admin/dashboard-board";
import { cn } from "@/lib/utils";

import { Metro, type Station } from "./metro";
import { PeopleDrawer, type DrawerRow, type DrawerSpec } from "./people-drawer";
import { BoardMotion, Breakdown, CountUp, DotField, FacePile, initials, Versus, type Face } from "./visuals";


const fmt = (n: number) => n.toLocaleString("en-IN");
const AI_LABEL: Record<string, string> = { not_applied: "Not applied", applied: "Applied", scheduled: "Scheduled", sent: "Link sent", expired: "Expired", completed: "Interviewed" };
const REPLY_LABEL: Record<BoardOffer["reply"], string> = { pending: "No reply yet", accepted: "Accepted", rejected: "Rejected", expired: "Expired", withdrawn: "Withdrawn" };
const REPLY_TONE: Record<BoardOffer["reply"], NonNullable<DrawerRow["chip"]>["tone"]> = { pending: "wait", accepted: "good", rejected: "bad", expired: "plain", withdrawn: "plain" };
const STAGE_LABEL: Record<BoardMeeting["stage"], string> = { sent: "Waiting for the student", accepted: "Accepted", completed: "Completed", declined: "Declined", expired: "Expired", withdrawn: "Withdrawn" };
const FTE_LABEL: Record<string, string> = { none: "FTE: none", applied: "FTE requested", approved: "FTE approved" };
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "—");
/** "3 h ago", "Online now", "Never", "Hidden": the student's last seen, worded for a list. */
function seenOf(s: BoardStudent, now: number): string {
  if (s.activityHidden) return "Hidden";
  if (s.online) return "Online now";
  if (!s.lastSeenAt) return "Never";
  const mins = Math.max(0, Math.round((now - new Date(s.lastSeenAt).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d} ${d === 1 ? "day" : "days"} ago` : dateOf(s.lastSeenAt);
}

/** The student's latest step, in one line: the furthest point they reached and with whom. */
function whatOf(s: BoardStudent, offers: BoardOffer[], meets: BoardMeeting[]): string {
  const hire = offers.find((o) => o.hired);
  if (hire) return `Hired by ${hire.employer} · ${hire.track === "full_time" ? "full-time" : "internship"}`;
  const accepted = offers.find((o) => o.reply === "accepted");
  if (accepted) return `Accepted ${accepted.employer}'s offer · waiting for the employer's payment`;
  const pending = offers.find((o) => o.reply === "pending");
  if (pending) return `Offer from ${pending.employer} · no reply yet`;
  const meetSent = meets.find((m) => m.stage === "sent");
  if (meetSent) return `Meeting request from ${meetSent.employer} · no reply yet`;
  const meetBooked = meets.find((m) => m.stage === "accepted");
  if (meetBooked) return `Meeting with ${meetBooked.employer} booked${meetBooked.startsAt ? ` for ${dateOf(meetBooked.startsAt)}` : ""}`;
  const last = offers[0];
  if (last) return `Offer from ${last.employer} ${REPLY_LABEL[last.reply].toLowerCase()}`;
  if (s.aiStatus === "completed") return `AI interviewed${s.score != null ? ` · score ${s.score.toFixed(1)}` : ""} · no offer yet`;
  if (s.pendingPayment) return "Applied for the AI interview · payment pending";
  if (s.aiStatus === "scheduled") return "AI interview scheduled";
  if (s.aiStatus === "sent") return "AI interview link sent · not taken yet";
  if (s.aiStatus === "expired") return "AI interview link expired";
  if (s.aiStatus === "applied") return "Applied for the AI interview · waiting for a link";
  if (s.profileComplete) return "Profile complete · AI interview not applied";
  return `Signed up · profile ${s.profilePct}% done`;
}


export function DashboardBoardView({
  data,
  initialView,
  canNudge,
  links,
}: {
  data: DashboardBoard;
  initialView: BoardView;
  canNudge: boolean;
  links: BoardLinks;
}) {
  const [view, setView] = useState<BoardView>(initialView);
  const [track, setTrack] = useState<TrackFilter>("all");
  const [drawer, setDrawer] = useState<DrawerSpec | null>(null);
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);

  // The view lives in the URL (shareable, survives a reload) without a server round trip.
  const pick = (v: BoardView) => {
    setView(v);
    const url = new URL(window.location.href);
    if (v === "students") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    window.history.replaceState(window.history.state, "", url);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.bad ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const onToast = useCallback((text: string, bad = false) => setToast({ text, bad }), []);

  const ix = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);
  const offerIx = useMemo(() => new Map(data.offers.map((o) => [o.id, o])), [data.offers]);
  const meetIx = useMemo(() => new Map(data.meetings.map((m) => [m.id, m])), [data.meetings]);
  const empIx = useMemo(() => new Map(data.employers.map((e) => [e.id, e])), [data.employers]);
  const offersBy = useMemo(() => Map.groupBy(data.offers, (o) => o.internId), [data.offers]);
  const meetsBy = useMemo(() => Map.groupBy(data.meetings, (x) => x.internId), [data.meetings]);

  /** A metric's list as drawer rows, from the same ids its count is the length of. */
  const open = useCallback(
    (title: string, list: MetricList, waiting?: MetricList) => {
      const now = Date.now();
      const studentRow = (s: BoardStudent, id: string, extra: Partial<DrawerRow> = {}, csv: Record<string, string | number | null> = {}): DrawerRow => ({
        id,
        targetId: s.id,
        name: s.name,
        sub: [s.college ?? "Individual account", s.year ? `Year ${s.year}` : null, s.branch].filter(Boolean).join(" · "),
        email: s.email,
        phone: s.phone,
        href: links.interns ? `/admin/interns/${encodeURIComponent(s.id)}` : null,
        what: whatOf(s, offersBy.get(s.id) ?? [], meetsBy.get(s.id) ?? []),
        seen: seenOf(s, now),
        // A list of offers or meetings leads with what the row is about (the offer, or the meeting with its reason or
        // feedback), right after the name; the student's own columns follow.
        csv: {
          Name: s.name, ...csv, "What happened": whatOf(s, offersBy.get(s.id) ?? [], meetsBy.get(s.id) ?? []), "Last seen": seenOf(s, now), Email: s.email, Phone: s.phone, College: s.college ?? "Individual", Year: s.year, Branch: s.branch,
          "Tech / non-tech": s.track === "tech" ? "Tech" : s.track === "non_tech" ? "Non-tech" : "Not interviewed yet",
          "Profile %": s.profilePct, "AI interview": AI_LABEL[s.aiStatus] ?? s.aiStatus, "Findtern Score": s.score,
          "Open to work": s.openToWork ? "Yes" : "No",
        },
        ...extra,
      });
      let rows: DrawerRow[] = [];
      let kind: DrawerSpec["kind"] = "students";
      if (list.kind === "students") rows = list.ids.map((id) => ix.get(id)).filter((s): s is BoardStudent => !!s).map((s) => studentRow(s, s.id));
      else if (list.kind === "offers")
        rows = list.ids.flatMap((id) => {
          const o = offerIx.get(id);
          const s = o && ix.get(o.internId);
          if (!o || !s) return [];
          const what = o.roleTitle ?? (o.track === "full_time" ? "Full-time offer" : "Internship");
          return [studentRow(s, o.id, { note: `${o.employer} · ${what}`, chip: { label: REPLY_LABEL[o.reply], tone: REPLY_TONE[o.reply] } }, { Employer: o.employer, Offer: what, Track: o.track === "full_time" ? "Full-time" : "Internship", "Offer status": REPLY_LABEL[o.reply], "Sent on": dateOf(o.createdAt) })];
        });
      else if (list.kind === "meetings")
        rows = list.ids.flatMap((id) => {
          const m = meetIx.get(id);
          const s = m && ix.get(m.internId);
          if (!m || !s) return [];
          return [studentRow(s, m.id, { note: `${m.employer} · ${dateOf(m.startsAt)}`, chip: { label: STAGE_LABEL[m.stage], tone: m.stage === "completed" ? "good" : m.stage === "sent" ? "wait" : "plain" } }, { Employer: m.employer, Meeting: STAGE_LABEL[m.stage], "Meeting date": dateOf(m.startsAt), Reason: m.reason, Feedback: m.feedback })];
        });
      else {
        kind = "employers";
        rows = list.ids.flatMap((id) => {
          const e = empIx.get(id);
          if (!e) return [];
          const what = (() => {
              const mine = data.offers.filter((o) => o.employerId === e.id);
              const hired = mine.filter((o) => o.hired).length;
              if (hired) return `Hired ${hired} · ${mine.length} ${mine.length === 1 ? "offer" : "offers"} sent`;
              if (mine.length) return `${mine.length} ${mine.length === 1 ? "offer" : "offers"} sent · no hire yet`;
              if (e.inDriveNow) return "In a campus drive now · no offer yet";
              return e.onboarded ? "Onboarded · no offer yet" : "Signed up · onboarding not finished";
            })();
          return [{
            id: e.id, targetId: e.id, name: e.company,
            what,
            sub: [e.contact, e.city, e.country].filter(Boolean).join(" · ") || "—",
            chip: e.fte !== "none" ? { label: FTE_LABEL[e.fte] ?? e.fte, tone: e.fte === "applied" ? "wait" : "good" } : undefined,
            email: e.email, phone: e.phone, href: links.companies ? `/admin/companies/${encodeURIComponent(e.id)}` : null,
            csv: {
              Company: e.company, "What happened": what, Contact: e.contact, Email: e.email, Phone: e.phone, City: e.city, Country: e.country, Size: e.size ?? "Not given",
              Onboarded: e.onboarded ? "Yes" : "No", "Came via": e.viaDrive ? "College drive" : "Direct", "In a drive now": e.inDriveNow ? "Yes" : "No",
              FTE: FTE_LABEL[e.fte] ?? e.fte, "Signed up": dateOf(e.createdAt),
            },
          } satisfies DrawerRow];
        });
      }
      const noun = kind === "employers" ? (rows.length === 1 ? "company" : "companies") : list.kind === "offers" ? (rows.length === 1 ? "offer" : "offers") : list.kind === "meetings" ? (rows.length === 1 ? "meeting" : "meetings") : rows.length === 1 ? "student" : "students";
      const waitingIds = waiting ? new Set(waiting.ids) : undefined;
      const sub = waitingIds ? `${fmt(rows.length)} reached, ${fmt(waitingIds.size)} waiting here` : `${fmt(rows.length)} ${noun}`;
      setDrawer({ title, sub, kind, rows, waitingIds, filename: `findtern-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv` });
    },
    [ix, offerIx, meetIx, empIx, offersBy, meetsBy, links, data.offers],
  );

  const asOf = new Date(data.generatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-[var(--admin-gap)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Dashboard view" className="inline-flex rounded-full bg-[color:var(--admin-panel-2)] p-1 max-sm:w-full">
          {BOARD_VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              type="button"
              id={`board-tab-${v.key}`}
              aria-selected={view === v.key}
              aria-controls="board-panel"
              onClick={() => pick(v.key)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const i = BOARD_VIEWS.findIndex((x) => x.key === v.key);
                const next = BOARD_VIEWS[(i + (e.key === "ArrowRight" ? 1 : BOARD_VIEWS.length - 1)) % BOARD_VIEWS.length];
                pick(next.key);
                document.getElementById(`board-tab-${next.key}`)?.focus();
              }}
              tabIndex={view === v.key ? 0 : -1}
              className={cn(
                "h-10 rounded-full px-5 text-[0.9375rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:flex-1 max-sm:px-2 touch:h-11",
                view === v.key ? "bg-[color:var(--admin-panel)] font-medium text-foreground shadow-[0_1px_2px_rgb(15_30_25/0.08)]" : "text-text-subtle hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="text-xs tabular-nums text-text-subtle">Data as of {asOf}</p>
      </div>

      <div id="board-panel" role="tabpanel" aria-labelledby={`board-tab-${view}`}>
        {view === "students" ? <StudentsView data={data} track={track} setTrack={setTrack} open={open} links={links} /> : null}
        {view === "employers" ? <EmployersView data={data} open={open} /> : null}
        {view === "colleges" ? <CollegesView colleges={data.colleges} open={open} links={links} /> : null}
      </div>

      <BoardMotion />
      <PeopleDrawer spec={drawer} onClose={() => setDrawer(null)} canNudge={canNudge} onToast={onToast} />
      {/* Always mounted, so a screen reader hears the text when it arrives. */}
      <div role="status" aria-live="polite" className={cn(toast ? "fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl px-4 py-3 text-sm text-white shadow-lg" : "sr-only", toast?.bad ? "bg-[#9b1c1c]" : "bg-brand-800")}>
        {toast?.text ?? ""}
      </div>
    </div>
  );
}

type Open = (title: string, list: MetricList, waiting?: MetricList) => void;

// ---------- Shared pieces ----------

function Card({ title, sub, action, className, children }: { title: string; sub?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn(ADMIN_SURFACE, "min-w-0 p-[var(--admin-pad-panel)]", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">{title}</h2>
          {sub ? <p className="mt-0.5 text-sm text-text-subtle">{sub}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

const C_MAIN = "var(--color-brand-700)";
const C_SOFT = "var(--color-brand-300)";
const C_WAIT = "var(--color-accent-500)";
const C_GREY = "var(--color-ink-300)";
const C_INK = "var(--color-ink-600)";

// ---------- Students ----------

/** The deep green hero every tab opens on: the finding in large type, the controls, then the line. */
function NightPanel({ headline, side, note, children }: { headline: React.ReactNode; side?: React.ReactNode; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-admin-card)] bg-[color:var(--admin-deep)] p-5 text-[#f2faf6] md:p-8">
      {/* A faint track map behind the line: the network this line belongs to. Drawn, quiet, no glow. */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d="M-5 78 C 20 70, 30 30, 55 34 S 90 20, 105 8" fill="none" stroke="#fff" strokeWidth="0.6" />
        <path d="M-5 96 C 25 92, 45 60, 70 64 S 95 50, 105 44" fill="none" stroke="#fff" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
      </svg>
      {/* The controls keep one place whatever the headline says, so switching a filter never moves them. */}
      {side ? <div className="relative mb-5 flex flex-wrap items-center justify-between gap-2">{side}</div> : null}
      <h2 className="relative max-w-3xl text-balance text-2xl font-medium leading-[1.2] tracking-[-0.015em] md:min-h-[4.8rem] md:text-[2rem]">{headline}</h2>
      {note ? <div className="relative mt-2 text-sm text-[#a9cbbd]">{note}</div> : null}
      <div className="relative mt-8 overflow-x-auto pb-2">{children}</div>
    </section>
  );
}

function Pills<K extends string>({ value, options, onChange, label }: { value: K; options: readonly (readonly [K, string, number])[]; onChange: (k: K) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-white/10 p-1">
      {options.map(([k, l, c]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "h-8 rounded-full px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch:h-11",
            value === k ? "bg-[#f2faf6] font-medium text-[#0a3a2c]" : "text-[#cfe6db] hover:text-white",
          )}
        >
          {l} <span className="tabular-nums opacity-70">{fmt(c)}</span>
        </button>
      ))}
    </div>
  );
}

function LiveChip({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-sm text-[#e3f3eb] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch:h-11"
    >
      <span className="relative flex size-2">
        {count > 0 ? <span className="absolute inline-flex size-full rounded-full bg-[#7be0b0] opacity-60 motion-safe:animate-ping" /> : null}
        <span className={cn("relative inline-flex size-2 rounded-full", count > 0 ? "bg-[#7be0b0]" : "bg-white/30")} />
      </span>
      <span className="font-semibold tabular-nums">{fmt(count)}</span> online now
    </button>
  );
}

/** A big figure with the faces behind it. */
function PeopleFigure({ label, list, faces, tone, onOpen, hint }: { label: string; list: MetricList; faces: Face[]; tone?: "wait"; onOpen: () => void; hint?: string }) {
  const v = list.ids.length;
  return (
    <div className="min-w-0">
      <button type="button" onClick={onOpen} className="group block rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <span className="block text-sm text-text-subtle">{label}</span>
        <CountUp value={v} className={cn("mt-0.5 block text-[2.25rem] font-semibold leading-none tracking-[-0.02em] underline-offset-4 group-hover:underline", tone === "wait" && v > 0 ? "text-accent-700" : "text-foreground")} />
      </button>
      <div className="mt-3 min-h-8">
        {v > 0 ? <FacePile faces={faces} total={v} max={4} onOpen={onOpen} label={`See all ${fmt(v)}`} /> : <span className="text-xs text-text-subtle">{hint ?? "No one right now"}</span>}
      </div>
    </div>
  );
}

function StudentsView({ data, track, setTrack, open, links }: { data: DashboardBoard; track: TrackFilter; setTrack: (t: TrackFilter) => void; open: Open; links: BoardLinks }) {
  const m = useMemo(() => studentMetrics(data, track), [data, track]);
  const counts = useMemo(() => trackCounts(data.students), [data.students]);
  const nameOf = useMemo(() => new Map(data.students.map((s) => [s.id, s.name])), [data.students]);
  const internOf = useMemo(() => new Map([...data.offers.map((o) => [o.id, o.internId] as const), ...data.meetings.map((x) => [x.id, x.internId] as const)]), [data.offers, data.meetings]);
  const [profileView, setProfileView] = useState<"work" | "account">("work");
  const n = (l: MetricList) => l.ids.length;
  /** Faces for a list: the students behind it, once each. */
  const faces = (l: MetricList, max = 8): Face[] => {
    const seen = new Set<string>();
    const out: Face[] = [];
    for (const id of l.ids) {
      const sid = l.kind === "students" ? id : internOf.get(id);
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      out.push({ id: sid, name: nameOf.get(sid) ?? "Student" });
      if (out.length >= max) break;
    }
    return out;
  };
  const tag = track === "all" ? "" : track === "tech" ? " (tech)" : " (non-tech)";
  // One journey: a stop counts everyone who got this far, so the drop between stops is exactly who waits there.
  const path = funnel([m.signedUp.ids, m.profileComplete.ids, m.aiApplied.ids, m.aiInterviewed.ids, m.hired.ids]);
  const st = (i: number, key: string, label: string, extra: Partial<Station> = {}): Station => {
    const f = path[i];
    const list: MetricList = { kind: "students", ids: f.reached };
    const waiting: MetricList | null = i < path.length - 1 ? { kind: "students", ids: f.waiting } : null;
    const skipped: MetricList = { kind: "students", ids: f.skipped };
    const skipSpur = n(skipped) ? [{ key: "skip", label: "Moved on without it", count: n(skipped), onOpen: () => open(`${label}: moved on without it` + tag, skipped) }] : [];
    return {
      key, label, reached: n(list), waiting: waiting ? n(waiting) : undefined,
      faces: waiting ? faces(waiting, 4) : undefined,
      onOpenWaiting: waiting ? () => open(label + tag, list, waiting) : undefined,
      onOpen: () => open(label + tag, list, waiting ?? undefined),
      ...extra,
      spurs: [...skipSpur, ...(extra.spurs ?? [])],
    };
  };
  const stations: Station[] = [
    st(0, "signedUp", "Signed up"),
    st(1, "profile", "Profile completed"),
    st(2, "applied", "Applied for AI interview", {
      spurs: [
        { key: "pay", label: "Pending payment", count: n(m.pendingPayment), onOpen: () => open("Pending payment" + tag, m.pendingPayment) },
        { key: "sched", label: "Scheduled", count: n(m.aiScheduled), onOpen: () => open("AI interview scheduled" + tag, m.aiScheduled) },
      ],
    }),
    st(3, "interviewed", "AI interviewed"),
    {
      ...st(4, "hired", "Hired", { tone: "end", caption: `${pct(n(m.hired), n(m.signedUp)) ?? 0}% of signups` }),
      branch: [
        { key: "int", label: "Internship", count: n(m.hiredInternship), onOpen: () => open("Hired: internship" + tag, m.hiredInternship) },
        { key: "ft", label: "Full-time", count: n(m.hiredFullTime), onOpen: () => open("Hired: full-time" + tag, m.hiredFullTime) },
      ],
    },
  ];
  // The stop where the most people are waiting is the board's finding.
  const stuck = stations.filter((s) => s.waiting).sort((a, b) => (b.waiting ?? 0) - (a.waiting ?? 0))[0];

  return (
    <div className="space-y-[var(--admin-gap)]">
      <NightPanel
        headline={
          <>
            {stuck ? (
              <>
                <span className="text-accent-300">{fmt(stuck.waiting ?? 0)}</span> of {fmt(stuck.reached)} are stuck at {stuck.label}.{" "}
              </>
            ) : null}
            {n(m.signedUp) === 0 ? (
              <span className="text-[#a9cbbd]">{track === "all" ? "No students yet." : `No ${track === "tech" ? "tech" : "non-tech"} students yet.`}</span>
            ) : (
              <span className="text-[#a9cbbd]">
                {fmt(n(m.hired))} of {fmt(n(m.signedUp))} signups are hired.
              </span>
            )}
          </>
        }
        side={
          <>
            <LiveChip count={n(m.onlineNow)} onOpen={() => open("Online now" + tag, m.onlineNow)} />
            <Pills
              label="Tech or non-tech students"
              value={track}
              onChange={setTrack}
              options={[["all", "All", counts.all], ["tech", "Tech", counts.tech], ["non_tech", "Non-tech", counts.non_tech]] as const}
            />
          </>
        }
        note={
          track === "all"
            ? `Tech or non-tech is known after the AI interview: a coding score means tech. ${fmt(counts.unknown)} not interviewed yet.`
            : `Only ${track === "tech" ? "tech" : "non-tech"} students: their AI interview ${track === "tech" ? "had" : "had no"} coding score.`
        }
      >
        {n(m.signedUp) === 0 ? (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
            <div>
              <p className="text-lg font-medium">{track === "all" ? "No students on the line yet" : `No ${track === "tech" ? "tech" : "non-tech"} students on the line yet`}</p>
              <p className="mt-1 text-sm text-[#a9cbbd]">They appear here once an AI interview is scored {track === "non_tech" ? "without" : "with"} a coding round.</p>
              <button type="button" onClick={() => setTrack("all")} className="mt-4 inline-flex h-9 items-center rounded-full bg-[#f2faf6] px-4 text-sm font-medium text-[#0a3a2c] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch:h-11">
                Show all students
              </button>
            </div>
          </div>
        ) : (
          <Metro stations={stations} theme="night" className="md:min-w-[48rem]" />
        )}
      </NightPanel>

      <div className="grid gap-[var(--admin-gap)] lg:grid-cols-12">
        <Card
          title="Waiting on students"
          sub="Each face is someone you can nudge today"
          className="lg:col-span-5"
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-6">
            <PeopleFigure label="Offers, no reply" list={m.offersAwaiting} faces={faces(m.offersAwaiting)} tone="wait" onOpen={() => open("Offers awaiting reply" + tag, m.offersAwaiting)} />
            <PeopleFigure label="Meetings, no reply" list={m.meetingsAwaiting} faces={faces(m.meetingsAwaiting)} tone="wait" onOpen={() => open("Meetings awaiting reply" + tag, m.meetingsAwaiting)} />
            <PeopleFigure label="CGPA to check" list={m.cgpaPending} faces={faces(m.cgpaPending)} tone="wait" onOpen={() => open("Awaiting CGPA check" + tag, m.cgpaPending)} hint="Every CGPA is checked" />
            <PeopleFigure label="Offers expired" list={m.offersExpired} faces={faces(m.offersExpired)} onOpen={() => open("Offers expired" + tag, m.offersExpired)} hint="None lapsed unanswered" />
          </div>
          {links.cgpa ? (
            <Link href="/admin/cgpa-verifications" className="mt-5 inline-block text-sm text-primary underline-offset-4 hover:underline">
              Review CGPA checks
            </Link>
          ) : null}
        </Card>

        <Card title="Offers and meetings" sub="How students answered, every offer and meeting so far" className="lg:col-span-7">
          <div className="space-y-6">
            {(
              [
                ["Internship proposals", "Internship proposals", "internship"],
                ["Full-time offers", "Full-time offers", "fullTime"],
              ] as const
            ).map(([title, name, k]) => (
              <Breakdown
                key={k}
                title={title}
                total={n(m[`${k}All`])}
                onOpenTotal={() => open(`${name}, all` + tag, m[`${k}All`])}
                parts={(
                  [
                    ["Accepted", "accepted", C_MAIN],
                    ["Rejected", "rejected", C_INK],
                    ["Expired", "expired", C_WAIT],
                    ["Withdrawn", "withdrawn", C_GREY],
                    ["Waiting", "still waiting", C_SOFT],
                  ] as const
                ).map(([label, word, color]) => ({
                  key: label,
                  label,
                  value: n(m[`${k}${label}`]),
                  color,
                  onOpen: () => open(`${name} ${word}` + tag, m[`${k}${label}`]),
                }))}
              />
            ))}
            <Breakdown
              title="Meetings"
              total={n(m.meetsAll)}
              onOpenTotal={() => open("Meetings, all" + tag, m.meetsAll)}
              parts={(
                [
                  ["Completed", "completed", C_MAIN, m.meetsCompleted],
                  ["Upcoming", "upcoming", C_SOFT, m.meetsUpcoming],
                  ["Waiting", "awaiting reply", "var(--color-brand-200)", m.meetingsAwaiting],
                  ["Declined", "declined", C_INK, m.meetsDeclined],
                  ["Expired", "expired", C_WAIT, m.meetsExpired],
                  ["Withdrawn", "withdrawn", C_GREY, m.meetsWithdrawn],
                ] as const
              ).map(([label, word, color, list]) => ({ key: label, label, value: n(list), color, onOpen: () => open(`Meetings ${word}` + tag, list) }))}
            />
          </div>
        </Card>

        <Card
          title="Every student, one dot each"
          sub={profileView === "work" ? "Who employers can find" : "What each student chose on their profile"}
          className="lg:col-span-7"
          action={
            <div role="group" aria-label="Colour the dots by" className="inline-flex rounded-full bg-[color:var(--admin-panel-2)] p-0.5">
              {(
                [
                  ["work", "Open to work"],
                  ["account", "Account type"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={profileView === k}
                  onClick={() => setProfileView(k)}
                  className={cn("h-8 rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11", profileView === k ? "bg-[color:var(--admin-panel)] font-medium text-foreground shadow-sm" : "text-text-subtle hover:text-foreground")}
                >
                  {l}
                </button>
              ))}
            </div>
          }
        >
          {profileView === "work" ? (
            <DotField
              key="work"
              label="Students by open to work"
              groups={[
                { key: "o", label: "Open to work", ids: m.openToWork.ids, color: C_MAIN, onOpen: () => open("Open to work" + tag, m.openToWork) },
                { key: "h", label: "Hidden", ids: m.hidden.ids, color: C_WAIT, onOpen: () => open("Hidden profiles" + tag, m.hidden) },
              ]}
            />
          ) : (
            <DotField
              key="account"
              label="Students by account type"
              groups={[
                { key: "c", label: "College account", ids: m.accountCollege.ids, color: C_MAIN, onOpen: () => open("College accounts" + tag, m.accountCollege) },
                { key: "i", label: "Individual account", ids: m.accountIndividual.ids, color: C_WAIT, onOpen: () => open("Individual accounts" + tag, m.accountIndividual) },
                { key: "u", label: "Not chosen yet", ids: m.accountUnset.ids, color: C_GREY, onOpen: () => open("Account type not chosen" + tag, m.accountUnset) },
              ]}
            />
          )}
        </Card>

        <Card title="Hired" sub="Students with a paid hire, and their guarantee" className="lg:col-span-5">
          <div className="mb-5">
            <FacePile faces={faces(m.hired, 8)} total={n(m.hired)} max={8} onOpen={() => open("Hired" + tag, m.hired)} label={`See all ${fmt(n(m.hired))} hired`} />
          </div>
          <div className="space-y-6">
            <Breakdown
              title="Placements"
              total={n(m.placeAll)}
              onOpenTotal={() => open("Placements, all" + tag, m.placeAll)}
              parts={[
                { key: "run", label: "Internship, running", value: n(m.placeInternRunning), color: C_MAIN, onOpen: () => open("Internships running" + tag, m.placeInternRunning) },
                { key: "done", label: "Internship, completed", value: n(m.placeInternCompleted), color: C_SOFT, onOpen: () => open("Internships completed" + tag, m.placeInternCompleted) },
                { key: "ft", label: "Full-time", value: n(m.placeFullTime), color: C_WAIT, onOpen: () => open("Full-time hires" + tag, m.placeFullTime) },
                { key: "ppo", label: "PPO", value: n(m.placePpo), color: C_INK, onOpen: () => open("PPOs, full-time after an internship" + tag, m.placePpo) },
              ]}
            />
            <Versus
              title="Where they work"
              left={{ label: "Indian companies", value: n(m.workIndia), onOpen: () => open("Working for Indian companies" + tag, m.workIndia) }}
              right={{ label: "Foreign", value: n(m.workAbroad), onOpen: () => open("Working for foreign companies" + tag, m.workAbroad), color: C_WAIT }}
            />
            <div>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">Placement guarantee</span>
                <span className="text-xs tabular-nums text-text-subtle">{fmt(n(m.aiInterviewed))} after the AI interview</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["Active", m.guaranteeActive, "Guarantee active", C_MAIN],
                    ["Ended", m.guaranteeEnded, "Guarantee ended", C_WAIT],
                    ["None", m.guaranteeNone, "No guarantee (college code)", C_GREY],
                  ] as const
                ).map(([l, list, title, color]) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => open(title + tag, list)}
                    className="group rounded-xl bg-[color:var(--admin-panel-2)] px-3 py-2.5 text-left outline-none transition-colors hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-1.5 text-xs text-text-subtle">
                      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
                      {l}
                    </span>
                    <CountUp value={n(list)} className="mt-1 block text-xl font-semibold text-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------- Employers ----------

function EmployersView({ data, open }: { data: DashboardBoard; open: Open }) {
  const m = useMemo(() => employerMetrics(data), [data]);
  const nameOf = useMemo(() => new Map(data.employers.map((e) => [e.id, e.company])), [data.employers]);
  const n = (l: MetricList) => l.ids.length;
  const faces = (l: MetricList, max = 6): Face[] => l.ids.slice(0, max).map((id) => ({ id, name: nameOf.get(id) ?? "Company" }));
  // Same journey rule as Students: a stop counts every employer who got this far.
  const path = funnel([m.signedUp.ids, m.onboarded.ids, m.sentOffer.ids, m.madeHire.ids]);
  const stop = (i: number, key: string, label: string, title: string, extra: Partial<Station> = {}): Station => {
    const f = path[i];
    const list: MetricList = { kind: "employers", ids: f.reached };
    const waiting: MetricList | null = i < path.length - 1 ? { kind: "employers", ids: f.waiting } : null;
    const skipped: MetricList = { kind: "employers", ids: f.skipped };
    const skipSpur = n(skipped) ? [{ key: "skip", label: "Moved on without it", count: n(skipped), onOpen: () => open(`${title}: moved on without it`, skipped) }] : [];
    return {
      key, label, reached: n(list), waiting: waiting ? n(waiting) : undefined,
      faces: waiting ? faces(waiting, 4) : undefined,
      onOpenWaiting: waiting ? () => open(title, list, waiting) : undefined,
      onOpen: () => open(title, list, waiting ?? undefined),
      ...extra,
      spurs: [...skipSpur, ...(extra.spurs ?? [])],
    };
  };
  const spur = (key: string, label: string, list: MetricList, title = label) => ({ key, label, count: n(list), onOpen: () => open(title, list) });
  const journey: Station[] = [
    stop(0, "signedUp", "Signed up", "All employers"),
    stop(1, "onboarded", "Onboarded", "Onboarded employers", {
      spurs: [spur("drive", "In a campus drive now", m.inDriveNow), spur("fteReq", "FTE requested", m.fteRequested), spur("fteOk", "FTE approved", m.fteApproved)],
    }),
    stop(2, "sent", "Sent an offer", "Employers who sent an offer"),
    {
      ...stop(3, "hired", "Hired someone", "Employers who hired", { tone: "end", caption: `${pct(n(m.madeHire), n(m.signedUp)) ?? 0}% of signups` }),
      branch: [spur("int", "Internship", m.hiredOnInternship, "Employers who hired on internship"), spur("ft", "Full-time", m.hiredOnFullTime, "Employers who hired full-time")],
    },
  ];
  const stuck = journey.filter((s) => s.waiting).sort((a, b) => (b.waiting ?? 0) - (a.waiting ?? 0))[0];
  const line = (key: string, label: string, sent: MetricList, hired: MetricList): Station[] => [
    { key: `${key}-sent`, label: "Offers sent", reached: n(sent), onOpen: () => open(`${label} offers sent`, sent) },
    { key: `${key}-hired`, label: "Hired", reached: n(hired), tone: "end", caption: `${pct(n(hired), n(sent)) ?? 0}% of offers`, onOpen: () => open(`Hired on ${label.toLowerCase()}`, hired) },
  ];
  // Company size as stacked companies: each block is one employer, so four companies read as four, not as a bar.
  // A column is at most 10 blocks tall; past that the top block says "+N" and the column (or View all) opens the rest.

  return (
    <div className="space-y-[var(--admin-gap)]">
      <NightPanel
        headline={
          <>
            {stuck ? (
              <>
                <span className="text-accent-300">{fmt(stuck.waiting ?? 0)}</span> of {fmt(stuck.reached)} employers are stuck at {stuck.label}.{" "}
              </>
            ) : null}
            <span className="text-[#a9cbbd]">
              {fmt(n(m.madeHire))} of {fmt(n(m.signedUp))} have hired on Findtern.
            </span>
          </>
        }
        note={`${fmt(n(m.inDriveNow))} in a campus drive right now · ${fmt(n(m.fteRequested))} waiting for FTE approval`}
      >
        <Metro stations={journey} theme="night" className="md:min-w-[44rem]" />
      </NightPanel>

      <div className="grid gap-[var(--admin-gap)] lg:grid-cols-12">
        <Card
          title="Company size"
          sub="Headcount each employer gave at signup, in people"
          className="lg:col-span-7"
          action={
            <button type="button" onClick={() => open("All employers", m.signedUp)} className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3.5 text-sm text-foreground transition-colors hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11">
              View all
            </button>
          }
        >
          <ul className="grid min-h-56 grid-cols-7 items-end gap-2 border-b border-[color:var(--admin-rule)] pt-2 sm:gap-3">
            {m.sizes.map((s) => {
              const c = n(s.list);
              const stack = stackOf(s.list.ids);
              const tone = { background: s.bucket === SIZE_UNKNOWN ? C_GREY : C_MAIN, color: "#fff" };
              return (
                <li key={s.bucket} className="flex h-full min-w-0 flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => open(`Company size: ${s.bucket}`, s.list)}
                    aria-label={`${s.bucket}: ${fmt(c)} employers. Open the list`}
                    className="group flex h-full flex-col items-center justify-end gap-1 rounded-t-lg pb-px outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="text-sm font-semibold tabular-nums text-foreground">{fmt(c)}</span>
                    <span className="flex w-full max-w-14 flex-col-reverse gap-[3px]">
                      {stack.shown.map((id, i) => (
                        <span
                          key={id}
                          title={nameOf.get(id)}
                          className="board-dot grid h-6 place-items-center rounded-md text-[0.625rem] font-semibold transition-transform group-hover:-translate-y-0.5"
                          style={{ ...tone, animationDelay: `${i * 70}ms` }}
                        >
                          {initials(nameOf.get(id) ?? "")}
                        </span>
                      ))}
                      {stack.more ? (
                        <span className="board-dot grid h-6 place-items-center rounded-md border border-dashed border-ink-300 bg-background text-[0.6875rem] font-semibold tabular-nums text-foreground" style={{ animationDelay: `${stack.shown.length * 70}ms` }}>
                          +{fmt(stack.more)}
                        </span>
                      ) : null}
                      {c === 0 ? <span className="h-0.5 rounded-full bg-ink-200" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <ul className="mt-2 grid grid-cols-7 gap-2 sm:gap-3" aria-hidden>
            {m.sizes.map((s) => (
              <li key={s.bucket} className="text-center text-xs tabular-nums text-text-subtle">{s.bucket}</li>
            ))}
          </ul>
        </Card>

        <Card title="Where they come from" className="lg:col-span-5">
          <div className="space-y-6">
            <Versus
              title="How they found Findtern"
              left={{ label: "College drive", value: n(m.viaDrive), onOpen: () => open("Came through a college drive", m.viaDrive) }}
              right={{ label: "Directly", value: n(m.direct), onOpen: () => open("Came directly", m.direct), color: C_SOFT }}
            />
            <Versus
              title="Country"
              left={{ label: "Indian", value: n(m.indian), onOpen: () => open("Indian employers", m.indian) }}
              right={{ label: "Other countries", value: n(m.foreign), onOpen: () => open("Employers outside India", m.foreign), color: C_WAIT }}
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--admin-rule)] pt-4">
              <FacePile faces={faces(m.signedUp, 8)} total={n(m.signedUp)} max={8} onOpen={() => open("All employers", m.signedUp)} label="See every employer" />
              <span className="text-sm text-text-subtle">every employer on Findtern</span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Offers and hires" sub="Proposals sent, and the ones that became a paid hire">
        <div className="grid gap-8 md:grid-cols-2">
          {(
            [
              ["int", "Internship", m.internshipOffers, m.hiredInternship],
              ["ft", "Full-time", m.fullTimeOffers, m.hiredFullTime],
            ] as const
          ).map(([k, l, sent, hired]) => (
            <div key={k} className="min-w-0">
              <h3 className="mb-4 text-sm font-medium text-text-subtle">{l}</h3>
              <Metro stations={line(k, l, sent, hired)} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------- Colleges (Design 07, as it was) ----------

const COLLEGE_STOPS: { k: keyof BoardCollege["funnel"]; l: string }[] = [
  { k: "onboarded", l: "Onboarded" },
  { k: "verified", l: "Verified" },
  { k: "profile80", l: "Profile 80%+" },
  { k: "aiScored", l: "AI scored" },
  { k: "gotOffer", l: "Got offer" },
  { k: "hired", l: "Hired" },
];
const HEALTH: { k: keyof BoardCollege["health"]; l: string }[] = [
  { k: "openToWorkOff", l: "Open to work off" },
  { k: "neverOnline", l: "Never online" },
  { k: "inactive7d", l: "Inactive 7 days" },
  { k: "aiPending", l: "AI pending" },
];

function weeklyReport(c: BoardCollege) {
  const rows: (string | number)[][] = [
    ["Measure", "Count"],
    ["Students on the roster", c.roster],
    ...COLLEGE_STOPS.map((s) => [s.l, c.funnel[s.k].length]),
    ...HEALTH.map((h) => [h.l, c.health[h.k].length]),
    ["Drives active", c.activeDrives],
    ["Drives in all", c.drives],
  ];
  const blob = new Blob(["﻿" + rows.map((r) => r.join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `weekly-report-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function CollegesView({ colleges, open, links }: { colleges: BoardCollege[]; open: Open; links: BoardLinks }) {
  const live = colleges.filter((c) => c.funnel.onboarded.length > 0).sort((a, b) => b.funnel.onboarded.length - a.funnel.onboarded.length);
  const idle = colleges.filter((c) => c.funnel.onboarded.length === 0);
  const list = (ids: string[]): MetricList => ({ kind: "students", ids });
  const name = (c: BoardCollege) =>
    links.colleges ? (
      <Link href={`/admin/colleges/${encodeURIComponent(c.id)}`} className="underline-offset-4 hover:underline">
        {c.name}
      </Link>
    ) : (
      c.name
    );

  return (
    <div className="space-y-[var(--admin-gap)]">
      <p className="text-sm text-text-subtle">
        {fmt(live.length)} of {fmt(colleges.length)} colleges have students on Findtern.{idle.length ? ` ${fmt(idle.length)} have none yet.` : ""}
      </p>
      {live.map((c) => {
        const path = funnel(COLLEGE_STOPS.map((s) => c.funnel[s.k]));
        const stations: Station[] = COLLEGE_STOPS.map((s, i) => {
          const f = path[i];
          const last = i === COLLEGE_STOPS.length - 1;
          return {
            key: s.k, label: s.l, reached: f.reached.length, waiting: last ? undefined : f.waiting.length, tone: last ? "end" : "line",
            onOpen: () => open(`${c.name} · ${s.l}`, list(f.reached), last ? undefined : list(f.waiting)),
            spurs: f.skipped.length ? [{ key: "skip", label: "Moved on without it", count: f.skipped.length, onOpen: () => open(`${c.name} · ${s.l}: moved on without it`, list(f.skipped)) }] : undefined,
          };
        });
        return (
          <section key={c.id} className={cn(ADMIN_SURFACE, "p-[var(--admin-pad-panel)] md:p-6")}>
            <header className="flex flex-wrap items-start gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-semibold text-white">
                {c.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-snug text-foreground">{name(c)}</h2>
                <p className="text-sm text-text-subtle">
                  {[c.city, `${fmt(c.roster)} on roster`, `${c.activeDrives} of ${c.drives} drives active`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => weeklyReport(c)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-ink-300 px-4 text-sm text-foreground transition-colors hover:border-ink-400 hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11"
              >
                <Download className="size-4" aria-hidden />
                Weekly college report
              </button>
            </header>
            <div className="mt-5 overflow-x-auto pb-1">
              <Metro stations={stations} className="md:min-w-[46rem]" />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[color:var(--admin-rule)] pt-4 text-sm">
              <span className="text-text-subtle">Health</span>
              {HEALTH.map((h) => (
                <button
                  key={h.k}
                  type="button"
                  onClick={() => open(`${c.name} · ${h.l}`, list(c.health[h.k]))}
                  className="text-foreground underline decoration-ink-300 underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {h.l} <span className="font-semibold tabular-nums">{fmt(c.health[h.k].length)}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {idle.length ? (
        <ul className="grid gap-[var(--admin-gap)] md:grid-cols-2">
          {idle.map((c) => (
            <li key={c.id} className={cn(ADMIN_SURFACE, "flex items-center gap-3 border-dashed p-4")}>
              <span aria-hidden className="size-3 shrink-0 rounded-full border-2 border-ink-300" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{name(c)}</div>
                <div className="text-xs text-text-subtle">{[c.city, `roster ${fmt(c.roster)}`, `${c.drives} drives`].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="text-xs tabular-nums text-text-subtle">0 onboarded</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
