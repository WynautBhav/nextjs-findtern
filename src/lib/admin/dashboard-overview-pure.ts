import { formatIst, formatMoney, shortDate, shortDateTime } from "../format.ts";
import { parseOffer } from "../offer.ts";
import { fullName } from "./dashboard-queues-pure.ts";
import type { QueueGroup, QueueKey } from "./dashboard-queues.types.ts";
import { istDayKey, istDayStart } from "./revenue.ts";

/**
 * Pure mappers behind the dashboard overview (KPI tiles, the week chart, the
 * next interview, the placements gauge, recent activity, the "Needs you"
 * rows). No database and no `@/` imports, so node:test can run them; the
 * loaders that feed them are in `dashboard-overview.ts`.
 */

const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ week

/** The seven India days of the current Monday-to-Sunday week, as `YYYY-MM-DD`. */
export function istWeekKeys(now: Date): string[] {
  const today = istDayKey(now);
  if (!today) return [];
  const at = Date.parse(`${today}T00:00:00Z`);
  const weekday = new Date(at).getUTCDay(); // 0 = Sunday
  const monday = at - ((weekday + 6) % 7) * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}

/** The instant the India week (Monday 00:00) began; null when `now` is not a date. */
export function istWeekStart(now: Date): Date | null {
  const first = istWeekKeys(now)[0];
  return first ? istDayStart(first) : null;
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type WeekBar = { label: string; value: number; state: "past" | "today" | "future" };

/**
 * One bar per day of the India week. `rows` are counts keyed by India day;
 * a day outside the week is ignored (and so not in `total`), a repeated day adds up.
 */
export function weekBars(now: Date, rows: { day: string; value: number }[]): { bars: WeekBar[]; total: number } {
  const keys = istWeekKeys(now);
  const today = istDayKey(now);
  const by = new Map<string, number>();
  for (const r of rows) {
    if (Number.isFinite(r.value) && r.value > 0) by.set(r.day, (by.get(r.day) ?? 0) + Math.round(r.value));
  }
  const bars = keys.map<WeekBar>((key, i) => ({
    label: WEEKDAY_SHORT[i],
    // A day that has not happened yet cannot have records, whatever the clock skew of a row says.
    value: today && key > today ? 0 : (by.get(key) ?? 0),
    state: key === today ? "today" : today && key > today ? "future" : "past",
  }));
  return { bars, total: bars.reduce((sum, b) => sum + b.value, 0) };
}

// ------------------------------------------------------------ next interview

/** Only http(s) links are offered as "Join meeting"; anything else (a javascript: URL, text) is not a link. */
export function safeMeetingLink(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type NextInterviewRow = {
  id: string;
  internId: string;
  first: string | null;
  last: string | null;
  company: string | null;
  slot: Date | null;
  meetingLink: string | null;
};

export type NextInterview = {
  id: string;
  internId: string;
  candidate: string;
  company: string;
  /** "Fri 6 Nov, 3:30 PM IST" */
  whenLabel: string;
  /** ISO instant, for the <time> element. */
  whenIso: string;
  joinHref: string | null;
};

/** The soonest booked interview, or null (and then the card says so) when there is none in the future. */
export function toNextInterview(row: NextInterviewRow | null | undefined, now: Date): NextInterview | null {
  if (!row || !row.slot || Number.isNaN(row.slot.getTime()) || row.slot.getTime() <= now.getTime()) return null;
  return {
    id: row.id,
    internId: row.internId,
    candidate: fullName(row.first, row.last),
    company: (row.company ?? "").trim() || "Employer",
    whenLabel: formatIst(row.slot),
    whenIso: row.slot.toISOString(),
    joinHref: safeMeetingLink(row.meetingLink),
  };
}

// ----------------------------------------------------------------- placements

export type PlacementSummary = {
  paid: number;
  awaiting: number;
  total: number;
  /** Whole percent of the total that is paid; 0 when there are no placements. */
  paidPct: number;
  segments: { label: string; value: number; tone: "done" | "progress" }[];
};

const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

/** Placements: employer-paid (hired) and accepted-but-unpaid. The segments always add up to `total`. */
export function placementSummary(counts: { paid: number; awaiting: number }): PlacementSummary {
  const paid = whole(counts.paid);
  const awaiting = whole(counts.awaiting);
  const total = paid + awaiting;
  return {
    paid,
    awaiting,
    total,
    paidPct: total === 0 ? 0 : Math.round((paid / total) * 100),
    segments: [
      { label: "Paid", value: paid, tone: "done" },
      { label: "Awaiting payment", value: awaiting, tone: "progress" },
    ],
  };
}

// ------------------------------------------------------------------------ KPIs

export type Kpi = { key: "needs" | "candidates" | "companies" | "placements"; label: string; value: number; caption: string };

export type KpiInput = {
  queueTotal: number;
  queueFresh: number;
  /** Some queue failed to load, so the total is a floor, not the truth. */
  queueFailed: boolean;
  signups: number;
  incompleteProfiles: number;
  /** Sign-ups this week that have a profile (the tile counts profiles, so this is never above it). */
  profilesThisWeek: number;
  companies: number | null;
  companiesThisWeek: number | null;
  placements: PlacementSummary | null;
};


/** "with a profile", then what is new and what is not finished; zero parts are left out. */
function candidateCaption(withProfile: number, fresh: number, incomplete: number): string {
  const parts = ["with a profile"];
  if (fresh > 0 && fresh >= withProfile) parts.push("all new this week");
  else if (fresh > 0) parts.push(`${COUNT.format(fresh)} new this week`);
  else if (incomplete > 0) parts.push(`${COUNT.format(incomplete)} incomplete`);
  return withProfile > 0 ? parts.join(" · ") : "No finished profiles yet";
}

/** Greeting by India clock hour. */
export function greetingFor(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** "just now", "12 min ago" (up to 2 h), "3 h ago", "2 d ago", else the date. Future times read "just now". */
export function relativeWhen(at: Date, now: Date): string {
  const sec = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 1000));
  if (sec < 60) return "just now";
  if (sec < 7200) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)} h ago`;
  if (sec < 7 * 86_400) return `${Math.floor(sec / 86_400)} d ago`;
  return shortDate(at, { day: "numeric", month: "short" });
}

/** "in 20 min", "in 5 h" (under 48 h), "in 3 days"; null for a time already past. */
export function untilWhen(at: Date, now: Date): string | null {
  const ms = at.getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${Math.max(1, min)} min`;
  if (min < 48 * 60) return `in ${Math.round(min / 60)} h`;
  const d = Math.round(min / 1440);
  return `in ${d} days`;
}
const COUNT = new Intl.NumberFormat("en-IN");

/**
 * The four tiles. Every figure is a variable from a loader: the candidate tile is signups minus the
 * incomplete ones (so with-profile + incomplete = signups), the placement tile is the gauge's total.
 * A figure whose read failed is `null` and the tile is dropped by the caller, never shown as 0.
 */
export function buildKpis(input: KpiInput): { kpis: Kpi[]; withProfile: number } {
  const signups = whole(input.signups);
  const incomplete = Math.min(whole(input.incompleteProfiles), signups);
  const withProfile = signups - incomplete;
  const fresh = Math.min(whole(input.queueFresh), whole(input.queueTotal));

  const kpis: Kpi[] = [
    {
      key: "needs",
      label: "Needs you",
      value: whole(input.queueTotal),
      caption: input.queueFailed
        ? "Some queues did not load"
        : input.queueTotal <= 0
          ? "Nothing waiting on the team"
          : `${COUNT.format(fresh)} new this week`,
    },
    {
      key: "candidates",
      label: "Candidates",
      value: withProfile,
      caption: candidateCaption(withProfile, Math.min(whole(input.profilesThisWeek), withProfile), incomplete),
    },
  ];
  if (input.companies != null) {
    const week = whole(input.companiesThisWeek ?? 0);
    kpis.push({
      key: "companies",
      label: "Hiring companies",
      value: whole(input.companies),
      caption: `${COUNT.format(week)} new this week`,
    });
  }
  if (input.placements) {
    const p = input.placements;
    kpis.push({
      key: "placements",
      label: "Placements",
      value: p.total,
      caption: `${COUNT.format(p.paid)} paid, ${COUNT.format(p.awaiting)} awaiting payment`,
    });
  }
  return { kpis, withProfile };
}

// -------------------------------------------------------------------- activity

/** Rows read per activity source; a group this big may be only the newest part of a longer run (\"6+\"). */
export const ACTIVITY_FETCH_LIMIT = 6;

export type ActivityKind = "payment" | "offer" | "project" | "signup";

export type ActivityInput = {
  recentUsers: { id: string; name: string; date: Date | null }[];
  recentProjects: { name: string; company: string | null; employerId: string; date: Date | null }[];
  recentAccepted: { internId: string; first: string | null; last: string | null; company: string | null; date: Date | null }[];
  recentPayments: { employerId: string; amountMinor: number; currency: string | null; company: string | null; date: Date | null }[];
};

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  /** The person or company the row is about; also the avatar's name. */
  name: string;
  /** Tints the avatar: stable per person. */
  tintKey: string;
  verb: string;
  object: string;
  status: { label: string; tone: "success" | "info" | "warning" | "neutral" };
  at: Date;
  href: string;
  /** More than 1 when consecutive events of one kind are folded into this row ("6 offers accepted"). */
  count?: number;
};

const MONEY = (minor: number, currency: string | null) =>
  formatMoney(minor, currency === "USD" ? "USD" : "INR", { zeroLabel: "₹0" });

/** The four sources merged, newest first, capped. Rows with no date are dropped: they cannot be placed in time. */
export function buildActivity(input: ActivityInput, limit = 5): ActivityItem[] {
  const items: ActivityItem[] = [];
  input.recentPayments.forEach((p, i) => {
    if (!p.date) return;
    items.push({
      id: `payment:${p.employerId}:${p.date.getTime()}:${i}`,
      kind: "payment",
      name: (p.company ?? "").trim() || "Employer",
      tintKey: p.employerId,
      verb: "paid",
      object: MONEY(p.amountMinor, p.currency),
      status: { label: "Paid", tone: "success" },
      at: p.date,
      href: "/admin/orders",
    });
  });
  input.recentAccepted.forEach((p, i) => {
    if (!p.date) return;
    items.push({
      id: `offer:${p.internId}:${p.date.getTime()}:${i}`,
      kind: "offer",
      name: fullName(p.first, p.last),
      tintKey: p.internId,
      verb: "accepted an offer from",
      object: (p.company ?? "").trim() || "an employer",
      status: { label: "Accepted", tone: "success" },
      at: p.date,
      href: `/admin/interns/${p.internId}`,
    });
  });
  input.recentProjects.forEach((p, i) => {
    if (!p.date) return;
    items.push({
      id: `project:${p.employerId}:${p.date.getTime()}:${i}`,
      kind: "project",
      name: (p.company ?? "").trim() || "Employer",
      tintKey: p.employerId,
      verb: "posted",
      object: p.name.trim() || "a project",
      status: { label: "New project", tone: "info" },
      at: p.date,
      href: `/admin/companies/${p.employerId}`,
    });
  });
  input.recentUsers.forEach((u) => {
    if (!u.date) return;
    items.push({
      id: `signup:${u.id}`,
      kind: "signup",
      name: u.name.trim() || "New candidate",
      tintKey: u.id,
      verb: "signed up",
      object: "",
      status: { label: "New", tone: "neutral" },
      at: u.date,
      href: `/admin/interns/${u.id}`,
    });
  });
  const sorted = items.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
  return groupActivity(sorted).slice(0, Math.max(0, limit));
}

const GROUP: Record<ActivityKind, { one: string; many: string; verb: string; href: string }> = {
  payment: { one: "payment", many: "payments", verb: "received", href: "/admin/orders" },
  offer: { one: "offer", many: "offers", verb: "accepted", href: "/admin/proposal-tracker" },
  project: { one: "project", many: "projects", verb: "posted", href: "/admin/companies" },
  signup: { one: "candidate", many: "candidates", verb: "signed up", href: "/admin/interns" },
};

/** Runs of two or more consecutive events of one kind become one row ("6 offers accepted"), at the newest time. */
export function groupActivity(items: ActivityItem[]): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (let i = 0; i < items.length; ) {
    let j = i + 1;
    while (j < items.length && items[j].kind === items[i].kind) j++;
    const n = j - i;
    if (n < 2) {
      out.push(items[i]);
    } else {
      const head = items[i];
      const g = GROUP[head.kind];
      const capped = n >= ACTIVITY_FETCH_LIMIT;
      out.push({ ...head, id: `group:${head.id}`, name: `${n}${capped ? "+" : ""} ${g.many}`, verb: g.verb, object: "", count: n, href: g.href });
    }
    i = j;
  }
  return out;
}

/** "Today, 14:20", "Yesterday, 09:05" or "5 Nov", all India time. */
export function activityWhen(at: Date, now: Date): string {
  const key = istDayKey(at);
  const clock = shortDateTime(at, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (key && key === istDayKey(now)) return `Today, ${clock}`;
  if (key && key === istDayKey(new Date(now.getTime() - DAY_MS))) return `Yesterday, ${clock}`;
  return shortDate(at, { day: "numeric", month: "short" });
}

// ------------------------------------------------------------------ queue rows

export type QueueRow = {
  key: QueueKey;
  label: string;
  /** null for a state (the calendar flag) and for a queue that failed to load. */
  count: number | null;
  /** "Not connected", "oldest 6 d", "next in 2 h", "Clear" ... */
  note: string;
  state: "work" | "clear" | "error" | "flag";
};

const days = (n: number) => `${Math.round(n)} d`;

/**
 * One row per queue for the "Needs you" panel. The note is the oldest waiting age of the records
 * shown (queues are sorted most urgent first), or for interviews without a link the time to the
 * soonest slot. Never invented: a queue that cannot tell says nothing.
 */
export function queueRows(groups: QueueGroup[], nowMs: number): QueueRow[] {
  return groups.map<QueueRow>((g) => {
    if (g.error) return { key: g.key, label: g.label, count: null, note: "Could not load", state: "error" };
    if (g.flag) {
      return g.count > 0
        ? { key: g.key, label: g.label, count: null, note: "Not connected", state: "flag" }
        : { key: g.key, label: "Google calendar", count: null, note: "Connected", state: "clear" };
    }
    if (g.count <= 0) return { key: g.key, label: g.label, count: 0, note: "Clear", state: "clear" };
    const ages = g.records.map((r) => r.ageDays).filter((a): a is number => a != null && Number.isFinite(a));
    const oldest = ages.length ? Math.max(...ages) : null;
    let note = "";
    if (oldest != null && oldest >= 1) note = `oldest ${days(oldest)}`;
    else if (g.key === "nolink" && g.records[0]?.when) note = soonest(g.records[0].when, nowMs);
    else if (oldest === 0) note = "oldest today";
    return { key: g.key, label: g.label, count: g.count, note, state: "work" };
  });
}

function soonest(whenIso: string, nowMs: number): string {
  const t = new Date(whenIso).getTime();
  if (Number.isNaN(t)) return "";
  const hours = (t - nowMs) / 3_600_000;
  if (hours < 1) return "next within the hour";
  if (hours < 48) return `next in ${Math.round(hours)} h`;
  return `next in ${Math.round(hours / 24)} d`;
}

/** Where a queue row opens: its own desk view, or for a state (no records) the page that fixes it. */
export function queueRowHref(row: QueueRow, group: QueueGroup | undefined): string {
  if (row.state === "flag" && group) return group.moreHref;
  return `/admin/dashboard?desk=1&queue=${row.key}`;
}

// ------------------------------------------------------------------ hire pipeline band

/**
 * The open stages of the proposal pipeline in order, as the dashboard's pipeline band draws them.
 * Same statuses as `PIPELINE_STAGES` in components/admin/proposal-pipeline-lanes.tsx (that file is a
 * component, so this pure module keeps its own copy of the open stages; "Closed" is not on the home).
 */
export const BAND_STAGES = [
  { key: "sent", label: "Sent", statuses: ["sent", "draft"] },
  { key: "interview", label: "Interview", statuses: ["interview_scheduled"] },
  { key: "accepted", label: "Accepted", statuses: ["accepted"] },
  { key: "processing", label: "Processing", statuses: ["processing"] },
  { key: "hired", label: "Hired", statuses: ["hired"] },
] as const;

export type BandStageKey = (typeof BAND_STAGES)[number]["key"];

/** A proposal row as the loader reads it. `since` is when it last moved (updated_at). */
export type BandRow = {
  id: string;
  status: string;
  internId: string;
  first: string | null;
  last: string | null;
  company: string | null;
  since: Date | null;
  offerDetails: unknown;
  currency: string | null;
};

export type BandCard = {
  id: string;
  internId: string;
  name: string;
  company: string;
  /** Whole days since it last moved; null when the row has no usable date. */
  waitingDays: number | null;
  valueMinor: number | null;
  currency: string;
};

export type BandStage = {
  key: BandStageKey;
  label: string;
  /** The true count in this stage, which may exceed `cards.length`. */
  count: number;
  /** Offer value per currency, never summed across currencies; empty when no offer has a figure. */
  totals: { currency: string; minor: number }[];
  /** The longest-waiting first, at most `cardLimit`. */
  cards: BandCard[];
  /** Days the longest-waiting card has waited; null when there are none or none is dated. */
  oldestDays: number | null;
};

export type PipelineBand = {
  stages: BandStage[];
  /** All proposals on the band. */
  total: number;
  /** The open stage a person should look at first (see `stuckStage`), or null. */
  stuck: BandStageKey | null;
};

/** The value the tracker shows for an offer: full-time CTC, else the total, else monthly x months. */
export function offerValue(offerDetails: unknown, rowCurrency: string | null): { minor: number | null; currency: string } {
  const o = parseOffer(offerDetails, rowCurrency);
  const minor = o.fullTime ? o.fullTime.annualCtcMinor : (o.totalMinor ?? (o.monthlyMinor != null ? o.monthlyMinor * o.months : null));
  return { minor: minor != null && Number.isFinite(minor) && minor > 0 ? Math.round(minor) : null, currency: o.currency };
}

/** Days a stage waits before the band marks it as stuck. */
export const STUCK_AFTER_DAYS = 3;

/**
 * The stage to look at first: among the open stages (never Hired), the one whose longest-waiting card
 * has waited the longest, if that is at least `STUCK_AFTER_DAYS`. Ties go to the stage with more cards,
 * then to the later stage (money is closer). Null when nothing has waited that long.
 */
export function stuckStage(stages: BandStage[]): BandStageKey | null {
  let best: BandStage | null = null;
  for (const s of stages) {
    if (s.key === "hired" || s.oldestDays == null || s.oldestDays < STUCK_AFTER_DAYS) continue;
    if (
      !best ||
      s.oldestDays > (best.oldestDays ?? 0) ||
      (s.oldestDays === (best.oldestDays ?? 0) && s.count >= best.count)
    ) {
      best = s;
    }
  }
  return best ? best.key : null;
}

/**
 * Groups proposal rows by stage for the band. Rows with a status that is on no stage are ignored.
 * `hiredCount` is the all-time hired count (the rows for Hired are only the latest few, so its count
 * cannot come from them); open stages count their rows. Cards are the longest-waiting first, except
 * Hired, which shows the most recent.
 */
export function buildPipelineBand(rows: BandRow[], hiredCount: number, now: Date, cardLimit = 3): PipelineBand {
  const stages = BAND_STAGES.map<BandStage>((def) => {
    const mine = rows.filter((r) => (def.statuses as readonly string[]).includes(r.status));
    const cards = mine.map<BandCard>((r) => {
      const v = offerValue(r.offerDetails, r.currency);
      const since = r.since && !Number.isNaN(r.since.getTime()) ? r.since : null;
      return {
        id: r.id,
        internId: r.internId,
        name: fullName(r.first, r.last),
        company: (r.company ?? "").trim() || "Employer",
        waitingDays: since ? Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS)) : null,
        valueMinor: v.minor,
        currency: v.currency,
      };
    });
    const byCurrency = new Map<string, number>();
    for (const c of cards) if (c.valueMinor != null) byCurrency.set(c.currency, (byCurrency.get(c.currency) ?? 0) + c.valueMinor);
    const waiting = cards.map((c) => c.waitingDays).filter((d): d is number => d != null);
    const sorted =
      def.key === "hired"
        ? [...cards].sort((a, b) => (a.waitingDays ?? Infinity) - (b.waitingDays ?? Infinity))
        : [...cards].sort((a, b) => (b.waitingDays ?? -1) - (a.waitingDays ?? -1));
    return {
      key: def.key,
      label: def.label,
      count: def.key === "hired" ? Math.max(0, Math.round(hiredCount)) : cards.length,
      // Hired has only its latest few rows here, so a total over them would understate it: none is shown.
      totals: def.key === "hired" ? [] : [...byCurrency].map(([currency, minor]) => ({ currency, minor })),
      cards: sorted.slice(0, cardLimit),
      oldestDays: def.key === "hired" || waiting.length === 0 ? null : Math.max(...waiting),
    };
  });
  return { stages, total: stages.reduce((n, s) => n + s.count, 0), stuck: stuckStage(stages) };
}
