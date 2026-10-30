import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, CalendarCheck2, CircleUserRound, LayoutList, ReceiptIndianRupee } from "lucide-react";

import { Pill, type Tone } from "@/components/app/primitives";
import { CompanyInitials } from "@/components/marketing/role-card";
import { shortDate } from "@/lib/format";
import type { MonthHours, ThreadKind, ThreadNode, ThreadTone } from "@/lib/journey";
import { cn } from "@/lib/utils";

/* ── Dashboard tiles (SPECS §2 dashboard exception) ──────────────────────
 * White, borderless, one soft shadow; the brand gradient on one key-number
 * tile only. Every tile's action is the round arrow in its top-right corner. */

const TILE =
  "min-w-0 rounded-apple-xl bg-white shadow-tile";

/** The round corner action. 36px, with a 44px hit area on touch. */
export function CornerLink({ href, label, onDark = false }: { href: string; label: string; onDark?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "apple-spring relative grid size-9 shrink-0 place-items-center rounded-full border touch:before:absolute touch:before:-inset-1 touch:before:content-['']",
        onDark
          ? "border-white/25 text-white hover:bg-white/10"
          : "border-ink-200 text-ink-700 hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700",
      )}
    >
      <ArrowUpRight className="size-4" aria-hidden />
    </Link>
  );
}

export function Tile({
  title,
  description,
  action,
  aside,
  children,
  className,
}: {
  title: string;
  /** One quiet line under the title. */
  description?: React.ReactNode;
  action?: { href: string; label: string };
  /** Small control beside the title (a legend, a period). */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(TILE, "flex flex-col p-5 lg:p-6", className)}>
      <div className={cn("flex min-h-9 items-center justify-between gap-3", description ? "mb-1" : "mb-4")}>
        <h2 className="text-base font-medium text-ink-900">{title}</h2>
        <div className="flex items-center gap-2">
          {aside}
          {action ? <CornerLink {...action} /> : null}
        </div>
      </div>
      {description ? <p className="mb-4 text-pretty text-sm text-ink-600">{description}</p> : null}
      {children}
    </section>
  );
}

/**
 * The key-number row: two up on a phone (the brand tile spans both), as many
 * 14rem columns as fit above that. A last tile left alone on a phone row
 * spans it, so the row never ends on an orphan.
 */
export const STAT_ROW =
  "grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] max-sm:[&>:last-child:nth-child(even)]:col-span-2";

export function StatTile({
  label,
  value,
  unit,
  meta,
  href,
  featured = false,
  index = 0,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  meta?: React.ReactNode;
  href?: string;
  /** The one brand-filled tile on the screen. */
  featured?: boolean;
  /** Position in the row, for the entrance stagger. */
  index?: number;
}) {
  // A long figure ("₹1,20,000", "Shared in the offer letter") starts smaller and may wrap, so it never clips at 375px.
  const long = (typeof value === "string" || typeof value === "number") && String(value).length > 6;
  return (
    <div
      style={{ animationDelay: `${index * 70}ms` }}
      className={cn(
        TILE,
        // The key numbers are the page's one entrance; other tiles are simply there.
        // Label, figure and note sit on STAT_ROW's shared rows (subgrid), so a two-line label or note never knocks a row's figures out of line.
        // No @container here: its layout containment switches subgrid off; the figure has its own.
        "relative isolate row-span-3 grid grid-rows-subgrid gap-0 overflow-hidden p-4 motion-safe:animate-tile-in sm:p-5",
        // The one brand tile is an owner decision (SPECS §2 dashboard exception).
        featured && "max-sm:col-span-2 bg-[linear-gradient(140deg,var(--color-brand-600)_0%,var(--color-brand-800)_55%,var(--color-brand-950)_100%)] text-white shadow-tile-brand", // taste-skill-ignore
      )}
    >
      {featured ? <Contours /> : null}
      <div className="flex items-start justify-between gap-3">
        <p className={cn("pt-1.5 text-sm font-medium", featured ? "text-white/85" : "text-ink-700")}>{label}</p>
        {href ? <CornerLink href={href} label={label} onDark={featured} /> : null}
      </div>
      {/* Sized to the tile, not the window, so a figure never breaks mid-number. */}
      <div className="@container self-end pt-3">
        <p className={cn("nums text-[clamp(var(--fig-min),16cqi,3.25rem)] font-medium leading-none tracking-[-0.03em]", long ? "break-words [--fig-min:1.25rem]" : "whitespace-nowrap [--fig-min:2rem]", featured ? "text-white" : "text-ink-900")}>
          {value}
          {unit ? <span className={cn("ml-1 text-base font-normal tracking-normal", featured ? "text-white/70" : "text-text-subtle")}>{unit}</span> : null}
        </p>
      </div>
      {meta ? <p className={cn("pt-2 text-xs", featured ? "text-white/75" : "text-text-subtle")}>{meta}</p> : null}
    </div>
  );
}

/** Topographic lines over the brand tile: the one textured surface on the screen. */
function Contours() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 240"
      preserveAspectRatio="xMaxYMax slice"
      className="pointer-events-none absolute inset-0 -z-10 size-full text-white/[0.09]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <path
          key={i}
          d={`M${150 + i * 14} 260 C ${190 + i * 10} ${190 - i * 12}, ${250 + i * 6} ${150 - i * 14}, 420 ${120 - i * 16}`}
        />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <ellipse key={`e${i}`} cx="360" cy="40" rx={26 + i * 22} ry={18 + i * 16} />
      ))}
    </svg>
  );
}

// A hatch is a pattern mark for "not sent yet", not a gradient fill.
const HATCH = "bg-[repeating-linear-gradient(135deg,var(--color-brand-300)_0_2px,transparent_2px_7px)] ring-1 ring-inset ring-brand-300"; // taste-skill-ignore

/**
 * Hours per month as pill bars: approved solid, sent and waiting light,
 * not sent yet hatched. Plain markup, no chart library; the numbers are
 * also in the text for screen readers.
 */
export function HoursChart({ months: all, now = new Date() }: { months: MonthHours[]; now?: Date }) {
  // Start at the first month with hours (keeping at least three), so the chart is not mostly empty tracks.
  const first = all.findIndex((m) => m.approved + m.sent + m.draft > 0);
  const months = all.slice(Math.max(0, Math.min(first < 0 ? 0 : first, all.length - 3)));
  const total = (m: MonthHours) => m.approved + m.sent + m.draft;
  const max = Math.max(1, ...months.map(total));
  const has = {
    approved: months.some((m) => m.approved > 0),
    sent: months.some((m) => m.sent > 0),
    draft: months.some((m) => m.draft > 0),
  };
  const label = (m: MonthHours) => shortDate(m.start, { month: "short", timeZone: "Asia/Kolkata" });
  // Same "YYYY-MM" (IST) shape as MonthHours.key.
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(now);
  const isNow = (m: MonthHours) => m.key === thisMonth;

  return (
    <div className="flex flex-1 flex-col">
      <ul className="grid items-end gap-3" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((m) => {
          const sum = total(m);
          return (
            <li key={m.key} className="flex flex-col items-center gap-2">
              <span className="sr-only">
                {`${label(m)}: ${sum} hours` +
                  (sum ? `, ${m.approved} approved, ${m.sent} waiting for review, ${m.draft} not sent yet` : "")}
              </span>
              <span aria-hidden className={cn("nums text-xs font-medium", sum ? "text-ink-700" : "invisible")}>
                {sum}h
              </span>
              {/* A pale full-height track, so an empty month still reads as a month. */}
              <span
                aria-hidden
                className={cn(
                  "flex h-40 w-full max-w-14 items-end overflow-hidden rounded-full",
                  isNow(m) ? "bg-brand-50 ring-1 ring-inset ring-brand-200" : "bg-ink-100",
                )}
              >
                {/* At least as tall as the bar is wide, so a short month is a round pill, not a sliver. */}
                <span
                  className="flex min-h-[min(100%,3.5rem)] w-full origin-bottom flex-col-reverse overflow-hidden rounded-full motion-safe:animate-bar-grow"
                  style={{ height: `${(sum / max) * 100}%`, display: sum ? undefined : "none" }}
                >
                  {m.approved ? <span className="bg-brand-700" style={{ flexGrow: m.approved }} /> : null}
                  {m.sent ? <span className="bg-brand-300" style={{ flexGrow: m.sent }} /> : null}
                  {m.draft ? <span className={HATCH} style={{ flexGrow: m.draft }} /> : null}
                </span>
              </span>
              <span aria-hidden className={cn("text-xs", isNow(m) ? "font-medium text-ink-900" : "text-text-subtle")}>
                {label(m)}
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-700" aria-hidden>
        {has.approved ? <Legend swatch="bg-brand-700">Approved</Legend> : null}
        {has.sent ? <Legend swatch="bg-brand-300">Waiting for review</Legend> : null}
        {has.draft ? <Legend swatch={HATCH}>Not sent yet</Legend> : null}
      </ul>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-full", swatch)} />
      {children}
    </li>
  );
}

const KIND_ICON: Record<ThreadKind, React.ReactNode> = {
  profile: <CircleUserRound />,
  proposal: <BriefcaseBusiness />,
  interview: <CalendarCheck2 />,
  timesheet: <LayoutList />,
  payout: <ReceiptIndianRupee />,
};

const TONE_PILL: Record<ThreadTone, [Tone, string]> = {
  action: ["waiting", "Needs you"],
  waiting: ["waiting", "Waiting"],
  done: ["live", "Done"],
  info: ["neutral", "Update"],
};

/**
 * The dashboard's activity: one line per event (icon, title, who, state,
 * date), like a task list. The full sentences stay on the Record page, one
 * click away.
 */
export function ActivityList({ nodes }: { nodes: ThreadNode[] }) {
  return (
    <ul className="-mx-2">
      {nodes.map((node) => {
        const [tone, state] = TONE_PILL[node.tone];
        const body = (
          <>
            {/* A named company gets its mark (the references' faces); anything else its kind's icon. */}
            {node.with && node.with !== "the company" && node.with !== "your manager" ? (
              <CompanyInitials name={node.with} className="size-10 bg-brand-700 text-white" />
            ) : (
              <span
                aria-hidden
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-[1.125rem]",
                  node.kind === "payout" ? "bg-accent-100 text-accent-700" : "bg-brand-50 text-brand-700",
                )}
              >
                {KIND_ICON[node.kind]}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-pretty text-sm font-medium text-ink-900 group-hover:text-brand-700">{node.title}</span>
              {node.with ? <span className="mt-0.5 block text-xs text-text-subtle">with {node.with}</span> : null}
            </span>
            <span className="max-sm:hidden">
              <Pill tone={tone}>{state}</Pill>
            </span>
            <span className="nums w-14 shrink-0 text-right text-xs text-text-subtle">
              {shortDate(node.at, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
            </span>
          </>
        );
        const row = "group flex min-h-14 items-center gap-3 rounded-apple-sm px-2 py-2";
        return (
          <li key={node.id}>
            {node.href ? (
              <Link href={node.href} className={cn(row, "transition-colors hover:bg-ink-50")}>
                {body}
              </Link>
            ) : (
              <div className={row}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}



/* ── Signature elements: one per screen, drawn from that screen's own rows ── */

export const DAY_MARK: Record<string, { cell: string; legend: string }> = {
  Present: { cell: "bg-brand-700 text-white", legend: "Present" },
  Absent: { cell: "bg-white text-accent-700 ring-1 ring-inset ring-accent-500", legend: "Absent" },
  "Fixed off": { cell: "bg-ink-100 text-ink-600", legend: "Fixed off" },
  Holiday: { cell: `${HATCH} text-brand-800`, legend: "Holiday" },
  "": { cell: "bg-white text-ink-500 outline-1 -outline-offset-1 outline-dashed outline-ink-300", legend: "Not marked" },
};

/**
 * Scores out of 10 on one shared scale: a dot per part, the value beside it,
 * 0 / 5 / 10 marked once underneath, so parts compare at a glance. Used by
 * Home and by the AI interview report, so the two never draw it differently.
 */
export function ScoreScale({ rows }: { rows: { label: string; value: number | null }[] }) {
  // Narrow: label and value on a line, the track under them. From 26rem: one line each.
  const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 @[26rem]:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.5rem]";
  return (
    <dl className="@container grid content-start gap-y-3">
      {rows.map(({ label, value }) => (
        <div key={label} className={ROW}>
          <dt className="truncate text-sm text-ink-700">{label}</dt>
          <dd className="nums text-right text-sm font-semibold text-ink-900 @[26rem]:order-last">
            {value !== null ? value.toFixed(1) : <span className="font-normal text-text-subtle">Not rated</span>}
          </dd>
          <dd aria-hidden className="relative col-span-2 h-2 rounded-full bg-ink-100 @[26rem]:col-span-1">
            {value !== null ? (
              <span
                className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-700 ring-2 ring-white"
                style={{ left: `${Math.min(10, Math.max(0, value)) * 10}%` }}
              />
            ) : null}
          </dd>
        </div>
      ))}
      <div aria-hidden className={cn(ROW, "text-xs text-text-subtle")}>
        <span className="hidden @[26rem]:block" />
        <span className="nums col-span-2 flex justify-between @[26rem]:col-span-1">
          <span>0</span>
          <span>5</span>
          <span>10</span>
        </span>
        <span className="hidden @[26rem]:block" />
      </div>
    </dl>
  );
}

/**
 * One timesheet as its month: a week grid where every kind of day has its
 * own mark (Present filled, Fixed off a tone step, Holiday hatched, Absent
 * an outline, unmarked dashed), today ringed. The legend lists only kinds on
 * screen. Taste: "every kind of booking has its own mark".
 */
export function DayCalendar({
  days,
  today,
  jump = false,
}: {
  days: { date: string; status: string }[];
  today: string;
  /** In the editor every cell links to its day's row, and the legend counts. */
  jump?: boolean;
}) {
  if (days.length === 0) return null;
  // Monday-first offset of the first day.
  const lead = (new Date(`${days[0].date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const kinds = new Set(days.map((d) => d.status));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-text-subtle" aria-hidden>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
          <span key={w} className="pb-1">{w}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const day = Number(d.date.slice(8, 10));
          const label = shortDate(new Date(`${d.date}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
          return (
            <li
              key={d.date}
              style={i === 0 ? { gridColumnStart: lead + 1 } : undefined}
              className={cn(
                "nums grid h-10 place-items-center rounded-apple-sm text-sm font-medium sm:h-12",
                DAY_MARK[d.status]?.cell ?? DAY_MARK[""].cell,
                d.date === today && "ring-2 ring-ink-900 ring-offset-2",
              )}
            >
              {jump ? (
                <a
                  href={`#day-${d.date}`}
                  className="grid size-full place-items-center rounded-apple-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <span aria-hidden>{day}</span>
                  <span className="sr-only">{`Go to ${label}: ${d.status || "not marked"}${d.date === today ? ", today" : ""}`}</span>
                </a>
              ) : (
                <>
                  <span aria-hidden>{day}</span>
                  <span className="sr-only">{`${label}: ${d.status || "not marked"}${d.date === today ? ", today" : ""}`}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-700" aria-hidden>
        {Object.entries(DAY_MARK)
          .filter(([k]) => kinds.has(k))
          .map(([k, m]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("size-3 rounded-[3px]", m.cell)} />
              {m.legend}
              {jump ? <span className="nums font-medium text-ink-900">{days.filter((d) => d.status === k).length}</span> : null}
            </li>
          ))}
      </ul>
    </div>
  );
}

/**
 * A stipend as its months: one segment per month of the internship, filled
 * in order by what has been paid (solid) and what is pending (light). The
 * amounts are the payouts' own totals; the split by month assumes each
 * payout settles the oldest unpaid month, which is how they are run.
 */
export function StipendStrip({
  months,
  monthlyMinor,
  paidMinor,
  pendingMinor,
  start,
}: {
  months: number;
  monthlyMinor: number;
  paidMinor: number;
  pendingMinor: number;
  start: Date | null;
}) {
  if (months <= 0 || monthlyMinor <= 0) return null;
  const share = (amount: number, i: number) => Math.max(0, Math.min(1, amount / monthlyMinor - i));
  return (
    <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${months}, minmax(0, 1fr))` }}>
      {Array.from({ length: months }, (_, i) => {
        const paid = share(paidMinor, i);
        const pending = Math.min(1 - paid, share(paidMinor + pendingMinor, i) - paid);
        const when = start
          ? shortDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 15)), { month: "short", timeZone: "UTC" })
          : `Month ${i + 1}`;
        const state = paid >= 1 ? "paid" : paid + pending >= 1 ? "pending" : paid > 0 ? "part paid" : "to come";
        return (
          <li key={i} className="min-w-0">
            <span className="flex h-3 overflow-hidden rounded-full bg-ink-100" aria-hidden>
              <span className="bg-brand-700" style={{ width: `${paid * 100}%` }} />
              <span className="bg-brand-300" style={{ width: `${pending * 100}%` }} />
            </span>
            <span className="mt-1.5 block truncate text-xs text-text-subtle">
              {when}
              <span className="sr-only">: {state}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
