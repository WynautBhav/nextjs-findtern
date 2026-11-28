"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ADMIN_SURFACE } from "@/components/admin/surface";
import {
  BOARD_VIEWS,
  employerMetrics,
  pct,
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


const fmt = (n: number) => n.toLocaleString("en-IN");
const AI_LABEL: Record<string, string> = { not_applied: "Not applied", applied: "Applied", scheduled: "Scheduled", sent: "Link sent", expired: "Expired", completed: "Interviewed" };
const REPLY_LABEL: Record<BoardOffer["reply"], string> = { pending: "No reply yet", accepted: "Accepted", rejected: "Rejected", expired: "Expired", withdrawn: "Withdrawn" };
const REPLY_TONE: Record<BoardOffer["reply"], NonNullable<DrawerRow["chip"]>["tone"]> = { pending: "wait", accepted: "good", rejected: "bad", expired: "plain", withdrawn: "plain" };
const STAGE_LABEL: Record<BoardMeeting["stage"], string> = { sent: "Waiting for the student", accepted: "Accepted", completed: "Completed", expired: "Expired", withdrawn: "Withdrawn" };
const FTE_LABEL: Record<string, string> = { none: "FTE: none", applied: "FTE requested", approved: "FTE approved" };
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "—");
const lastSeen = (s: BoardStudent) => (s.activityHidden ? "Hidden" : s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Never");

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

  /** A metric's list as drawer rows, from the same ids its count is the length of. */
  const open = useCallback(
    (title: string, list: MetricList, waiting?: MetricList) => {
      const studentRow = (s: BoardStudent, id: string, extra: Partial<DrawerRow> = {}, csv: Record<string, string | number | null> = {}): DrawerRow => ({
        id,
        targetId: s.id,
        name: s.name,
        sub: [s.college ?? "Individual account", s.year ? `Year ${s.year}` : null, s.branch].filter(Boolean).join(" · "),
        email: s.email,
        phone: s.phone,
        href: links.interns ? `/admin/interns/${encodeURIComponent(s.id)}` : null,
        csv: {
          Name: s.name, Email: s.email, Phone: s.phone, College: s.college ?? "Individual", Year: s.year, Branch: s.branch,
          "Tech / non-tech": s.track === "tech" ? "Tech" : s.track === "non_tech" ? "Non-tech" : "Not interviewed yet",
          "Profile %": s.profilePct, "AI interview": AI_LABEL[s.aiStatus] ?? s.aiStatus, "Findtern Score": s.score,
          "Open to work": s.openToWork ? "Yes" : "No", "Last seen": lastSeen(s), ...csv,
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
          return [studentRow(s, m.id, { note: `${m.employer} · ${dateOf(m.startsAt)}`, chip: { label: STAGE_LABEL[m.stage], tone: m.stage === "completed" ? "good" : m.stage === "sent" ? "wait" : "plain" } }, { Employer: m.employer, Meeting: STAGE_LABEL[m.stage], "Meeting date": dateOf(m.startsAt) })];
        });
      else {
        kind = "employers";
        rows = list.ids.flatMap((id) => {
          const e = empIx.get(id);
          if (!e) return [];
          return [{
            id: e.id, targetId: e.id, name: e.company,
            sub: [e.contact, e.city, e.country].filter(Boolean).join(" · ") || "—",
            chip: e.fte !== "none" ? { label: FTE_LABEL[e.fte] ?? e.fte, tone: e.fte === "applied" ? "wait" : "good" } : undefined,
            email: e.email, phone: e.phone, href: links.companies ? `/admin/companies/${encodeURIComponent(e.id)}` : null,
            csv: {
              Company: e.company, Contact: e.contact, Email: e.email, Phone: e.phone, City: e.city, Country: e.country, Size: e.size ?? "Not given",
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
    [ix, offerIx, meetIx, empIx, links],
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

/** A figure that opens its list. `tone="wait"` marks a number that needs someone to act. */
function Figure({ label, value, onOpen, tone, hint }: { label: string; value: number; onOpen: () => void; tone?: "wait"; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group min-w-0 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="block text-sm text-text-subtle">{label}</span>
      <span className={cn("mt-0.5 block text-[1.75rem] font-semibold leading-tight tabular-nums underline-offset-4 group-hover:underline", tone === "wait" && value > 0 ? "text-accent-700" : "text-foreground")}>
        {fmt(value)}
      </span>
      {hint ? <span className="block text-xs text-text-subtle">{hint}</span> : null}
    </button>
  );
}

type Part = { key: string; label: string; list: MetricList; title: string; color: string };

/** Two or three counts that split one whole, as one bar with a clickable legend. */
function Split({ label, parts, open, totalLabel = "in all" }: { label: string; parts: Part[]; open: Open; totalLabel?: string }) {
  const total = parts.reduce((s, p) => s + p.list.ids.length, 0);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs tabular-nums text-text-subtle">{fmt(total)} {totalLabel}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
        {parts.map((p) => (total > 0 && p.list.ids.length > 0 ? <span key={p.key} style={{ width: `${(p.list.ids.length / total) * 100}%`, background: p.color }} className="h-full border-r-2 border-[color:var(--admin-panel)] last:border-r-0" /> : null))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              onClick={() => open(p.title, p.list)}
              className="inline-flex items-center gap-1.5 rounded text-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.label}
              <span className="font-semibold tabular-nums">{fmt(p.list.ids.length)}</span>
              {total > 0 ? <span className="text-xs tabular-nums text-text-subtle">{pct(p.list.ids.length, total)}%</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const C_MAIN = "var(--color-brand-700)";
const C_SOFT = "var(--color-brand-300)";
const C_WAIT = "var(--color-accent-500)";
const C_GREY = "var(--color-ink-300)";

/** Ids in `a` that are not in `b`: the people waiting at a stop. */
const minus = (a: MetricList, b: MetricList): MetricList => {
  const s = new Set(b.ids);
  return { kind: a.kind, ids: a.ids.filter((id) => !s.has(id)) };
};

// ---------- Students ----------

function StudentsView({ data, track, setTrack, open, links }: { data: DashboardBoard; track: TrackFilter; setTrack: (t: TrackFilter) => void; open: Open; links: BoardLinks }) {
  const m = useMemo(() => studentMetrics(data, track), [data, track]);
  const counts = useMemo(() => trackCounts(data.students), [data.students]);
  const n = (l: MetricList) => l.ids.length;
  const tag = track === "all" ? "" : track === "tech" ? " (tech)" : " (non-tech)";
  const st = (key: string, label: string, list: MetricList, next: MetricList | null, extra: Partial<Station> = {}): Station => {
    const waiting = next ? minus(list, next) : null;
    return {
      key, label, reached: n(list), waiting: waiting ? n(waiting) : undefined,
      onOpen: () => open(label + tag, list, waiting ?? undefined),
      ...extra,
    };
  };
  const stations: Station[] = [
    st("signedUp", "Signed up", m.signedUp, m.profileComplete),
    st("profile", "Profile completed", m.profileComplete, m.aiApplied),
    st("applied", "Applied for AI interview", m.aiApplied, m.aiInterviewed, {
      spurs: [
        { key: "pay", label: "Pending payment", count: n(m.pendingPayment), onOpen: () => open("Pending payment" + tag, m.pendingPayment) },
        { key: "sched", label: "Scheduled", count: n(m.aiScheduled), onOpen: () => open("AI interview scheduled" + tag, m.aiScheduled) },
      ],
    }),
    st("interviewed", "AI interviewed", m.aiInterviewed, m.hired),
    {
      ...st("hired", "Hired", m.hired, null, { tone: "end", caption: `${pct(n(m.hired), n(m.signedUp)) ?? 0}% of signups` }),
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
      <section className={cn(ADMIN_SURFACE, "p-[var(--admin-pad-panel)] md:p-6")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="max-w-3xl text-pretty text-lg font-medium leading-snug text-foreground md:text-xl">
            {stuck ? (
              <>
                {fmt(stuck.waiting ?? 0)} of {fmt(stuck.reached)} at <span className="text-accent-700">{stuck.label}</span> have not moved on yet.{" "}
              </>
            ) : null}
            {fmt(n(m.hired))} of {fmt(n(m.signedUp))} signups are hired.
          </h2>
          <div role="group" aria-label="Tech or non-tech students" className="inline-flex rounded-full border border-ink-200 p-0.5">
            {(
              [
                ["all", "All", counts.all],
                ["tech", "Tech", counts.tech],
                ["non_tech", "Non-tech", counts.non_tech],
              ] as const
            ).map(([k, l, c]) => (
              <button
                key={k}
                type="button"
                aria-pressed={track === k}
                onClick={() => setTrack(k)}
                className={cn(
                  "h-8 rounded-full px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11",
                  track === k ? "bg-brand-700 text-white" : "text-text-subtle hover:text-foreground",
                )}
              >
                {l} <span className="tabular-nums opacity-80">{fmt(c)}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-text-subtle">
          {track === "all"
            ? `Tech or non-tech is known after the AI interview (a coding score means tech). ${fmt(counts.unknown)} not interviewed yet.`
            : `Only ${track === "tech" ? "tech" : "non-tech"} students: those whose AI interview ${track === "tech" ? "had" : "had no"} coding score.`}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-subtle" aria-hidden>
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-brand-700" />On the line</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-[5px] rounded-full bg-accent-500" />10 waiting</span>
          <span>Amber arc: share still waiting</span>
        </div>
        <div className="mt-6 overflow-x-auto pb-1">
          <Metro stations={stations} className="md:min-w-[46rem]" />
        </div>
      </section>

      <div className="grid gap-[var(--admin-gap)] lg:grid-cols-12">
        <Card
          title="Waiting on students"
          className="lg:col-span-4"
          action={
            links.cgpa ? (
              <Link href="/admin/cgpa-verifications" className="text-sm text-primary underline-offset-4 hover:underline">
                CGPA checks
              </Link>
            ) : null
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Figure label="Offers, no reply" value={n(m.offersAwaiting)} tone="wait" onOpen={() => open("Offers awaiting reply" + tag, m.offersAwaiting)} />
            <Figure label="Meetings, no reply" value={n(m.meetingsAwaiting)} tone="wait" onOpen={() => open("Meetings awaiting reply" + tag, m.meetingsAwaiting)} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[color:var(--admin-rule)] pt-4">
            <Figure label="Online now" value={n(m.onlineNow)} onOpen={() => open("Online now" + tag, m.onlineNow)} />
            <Figure
              label="CGPA to check"
              value={n(m.cgpaPending)}
              tone="wait"
              onOpen={() => open("Awaiting CGPA check" + tag, m.cgpaPending)}
            />
          </div>
        </Card>

        <Card title="Offers and meetings" sub="Every offer and meeting so far" className="lg:col-span-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <Split
              label="Internship proposals"
              totalLabel="decided"
              open={open}
              parts={[
                { key: "a", label: "Accepted", list: m.internshipAccepted, title: "Internship proposals accepted" + tag, color: C_MAIN },
                { key: "r", label: "Rejected", list: m.internshipRejected, title: "Internship proposals rejected" + tag, color: C_GREY },
              ]}
            />
            <Split
              label="Full-time offers"
              totalLabel="decided"
              open={open}
              parts={[
                { key: "a", label: "Accepted", list: m.fullTimeAccepted, title: "Full-time offers accepted" + tag, color: C_MAIN },
                { key: "r", label: "Rejected", list: m.fullTimeRejected, title: "Full-time offers rejected" + tag, color: C_GREY },
              ]}
            />
            <Split
              label="Meetings"
              totalLabel="finished"
              open={open}
              parts={[
                { key: "c", label: "Completed", list: m.meetsCompleted, title: "Meetings completed" + tag, color: C_MAIN },
                { key: "e", label: "Expired", list: m.meetsExpired, title: "Meetings expired" + tag, color: C_GREY },
              ]}
            />
            <div className="flex items-end justify-between gap-3 sm:border-l sm:border-[color:var(--admin-rule)] sm:pl-5">
              <Figure label="Offers expired" value={n(m.offersExpired)} hint="Not answered before they lapsed" onOpen={() => open("Offers expired" + tag, m.offersExpired)} />
            </div>
          </div>
        </Card>

        <Card title="Profiles" sub="Who employers can find" className="lg:col-span-6">
          <div className="space-y-5">
            <Split
              label="Open to work or hidden"
              open={open}
              parts={[
                { key: "o", label: "Open to work", list: m.openToWork, title: "Open to work" + tag, color: C_MAIN },
                { key: "h", label: "Hidden", list: m.hidden, title: "Hidden profiles" + tag, color: C_GREY },
              ]}
            />
            <Split
              label="College or individual"
              open={open}
              parts={[
                { key: "c", label: "College-associated", list: m.collegeLinked, title: "College-associated students" + tag, color: C_MAIN },
                { key: "i", label: "Individual", list: m.individual, title: "Individual accounts" + tag, color: C_SOFT },
              ]}
            />
          </div>
        </Card>

        <Card title="Hired and the guarantee" sub="Students with a paid hire" className="lg:col-span-6">
          <div className="space-y-5">
            <Split
              label="Where they work"
              open={open}
              parts={[
                { key: "in", label: "Indian companies", list: m.workIndia, title: "Working for Indian companies" + tag, color: C_MAIN },
                { key: "ab", label: "Foreign companies", list: m.workAbroad, title: "Working for foreign companies" + tag, color: C_WAIT },
              ]}
            />
            <Split
              label="Placement guarantee, after the AI interview"
              open={open}
              parts={[
                { key: "a", label: "Active", list: m.guaranteeActive, title: "Guarantee active" + tag, color: C_MAIN },
                { key: "e", label: "Ended", list: m.guaranteeEnded, title: "Guarantee ended" + tag, color: C_WAIT },
                { key: "n", label: "No guarantee", list: m.guaranteeNone, title: "No guarantee (college code)" + tag, color: C_GREY },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------- Employers ----------

function EmployersView({ data, open }: { data: DashboardBoard; open: Open }) {
  const m = useMemo(() => employerMetrics(data), [data]);
  const n = (l: MetricList) => l.ids.length;
  const maxSize = Math.max(1, ...m.sizes.map((s) => n(s.list)));
  const stop = (key: string, label: string, title: string, list: MetricList, next: MetricList | null, extra: Partial<Station> = {}): Station => {
    const waiting = next ? minus(list, next) : null;
    return { key, label, reached: n(list), waiting: waiting ? n(waiting) : undefined, onOpen: () => open(title, list, waiting ?? undefined), ...extra };
  };
  const spur = (key: string, label: string, list: MetricList, title = label) => ({ key, label, count: n(list), onOpen: () => open(title, list) });
  const journey: Station[] = [
    stop("signedUp", "Signed up", "All employers", m.signedUp, m.onboarded),
    stop("onboarded", "Onboarded", "Onboarded employers", m.onboarded, m.sentOffer, {
      spurs: [spur("drive", "In a campus drive now", m.inDriveNow), spur("fteReq", "FTE requested", m.fteRequested), spur("fteOk", "FTE approved", m.fteApproved)],
    }),
    stop("sent", "Sent an offer", "Employers who sent an offer", m.sentOffer, m.madeHire),
    {
      ...stop("hired", "Hired someone", "Employers who hired", m.madeHire, null, { tone: "end", caption: `${pct(n(m.madeHire), n(m.signedUp)) ?? 0}% of signups` }),
      branch: [spur("int", "Internship", m.hiredOnInternship, "Employers who hired on internship"), spur("ft", "Full-time", m.hiredOnFullTime, "Employers who hired full-time")],
    },
  ];
  const stuck = journey.filter((s) => s.waiting).sort((a, b) => (b.waiting ?? 0) - (a.waiting ?? 0))[0];
  const line = (key: string, label: string, sent: MetricList, hired: MetricList): Station[] => [
    { key: `${key}-sent`, label: "Offers sent", reached: n(sent), onOpen: () => open(`${label} offers sent`, sent) },
    { key: `${key}-hired`, label: "Hired", reached: n(hired), tone: "end", caption: `${pct(n(hired), n(sent)) ?? 0}% of offers`, onOpen: () => open(`Hired on ${label.toLowerCase()}`, hired) },
  ];

  return (
    <div className="space-y-[var(--admin-gap)]">
      <section className={cn(ADMIN_SURFACE, "p-[var(--admin-pad-panel)] md:p-6")}>
        <h2 className="max-w-3xl text-pretty text-lg font-medium leading-snug text-foreground md:text-xl">
          {stuck ? (
            <>
              {fmt(stuck.waiting ?? 0)} of {fmt(stuck.reached)} at <span className="text-accent-700">{stuck.label}</span> have not moved on yet.{" "}
            </>
          ) : null}
          {fmt(n(m.madeHire))} of {fmt(n(m.signedUp))} employers have hired on Findtern.
        </h2>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-subtle" aria-hidden>
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-brand-700" />On the line</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-[5px] rounded-full bg-accent-500" />1 company waiting</span>
          <span>Amber arc: share still waiting</span>
        </div>
        <div className="mt-6 overflow-x-auto pb-1">
          <Metro stations={journey} perDot={1} className="md:min-w-[40rem]" />
        </div>
      </section>

      <Card title="Company size" sub="Headcount each employer gave at signup, in people">
        <ul className="grid h-52 grid-cols-7 items-end gap-2 border-b border-[color:var(--admin-rule)] sm:gap-4">
          {m.sizes.map((s) => (
            <li key={s.bucket} className="flex h-full min-w-0 flex-col justify-end">
              <button
                type="button"
                onClick={() => open(`Company size: ${s.bucket}`, s.list)}
                aria-label={`${s.bucket}: ${fmt(n(s.list))} employers. Open the list`}
                className="group flex h-full flex-col items-center justify-end gap-1.5 rounded-t-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm font-semibold tabular-nums text-foreground">{fmt(n(s.list))}</span>
                <span
                  className="block w-full max-w-16 rounded-t-md transition-[height] duration-500 group-hover:opacity-85 motion-reduce:transition-none"
                  style={{ height: `${(n(s.list) / maxSize) * 80}%`, minHeight: n(s.list) ? "0.375rem" : "2px", background: n(s.list) ? (s.bucket === "Not given" ? C_GREY : C_MAIN) : "var(--color-ink-200)" }}
                />
              </button>
            </li>
          ))}
        </ul>
        <ul className="mt-2 grid grid-cols-7 gap-2 sm:gap-4" aria-hidden>
          {m.sizes.map((s) => (
            <li key={s.bucket} className="text-center text-xs tabular-nums text-text-subtle">
              {s.bucket}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-[var(--admin-gap)] lg:grid-cols-12">
        <Card title="Where they come from" className="lg:col-span-5">
          <div className="space-y-5">
            <Split
              label="How they found Findtern"
              open={open}
              parts={[
                { key: "d", label: "College drive", list: m.viaDrive, title: "Came through a college drive", color: C_MAIN },
                { key: "x", label: "Directly", list: m.direct, title: "Came directly", color: C_SOFT },
              ]}
            />
            <Split
              label="Country"
              open={open}
              parts={[
                { key: "in", label: "Indian", list: m.indian, title: "Indian employers", color: C_MAIN },
                { key: "ab", label: "Other countries", list: m.foreign, title: "Employers outside India", color: C_WAIT },
              ]}
            />
          </div>
        </Card>

        <Card title="Offers and hires" sub="Proposals sent, and the ones that became a paid hire" className="lg:col-span-7">
          <div className="grid gap-6 sm:grid-cols-2">
            {(
              [
                ["int", "Internship", m.internshipOffers, m.hiredInternship],
                ["ft", "Full-time", m.fullTimeOffers, m.hiredFullTime],
              ] as const
            ).map(([k, l, sent, hired]) => (
              <div key={k} className="min-w-0">
                <h3 className="mb-3 text-sm font-medium text-text-subtle">{l}</h3>
                <Metro stations={line(k, l, sent, hired)} />
              </div>
            ))}
          </div>
        </Card>
      </div>
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
        const stations: Station[] = COLLEGE_STOPS.map((s, i) => {
          const ids = c.funnel[s.k];
          const next = COLLEGE_STOPS[i + 1];
          const nextSet = next ? new Set(c.funnel[next.k]) : null;
          const waiting = nextSet ? ids.filter((id) => !nextSet.has(id)).length : undefined;
          return {
            key: s.k, label: s.l, reached: ids.length, waiting, tone: next ? "line" : "end",
            onOpen: () => open(`${c.name} · ${s.l}`, list(ids), nextSet ? list(ids.filter((id) => !nextSet.has(id))) : undefined),
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
