import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarClock } from "lucide-react";

import { FigurePanel, SignatureHero } from "@/components/intern/kit/hero";
import { CountUp } from "@/components/motion/count-up";
import { Stagger } from "@/components/intern/kit/motion";
import { BigFigure, EmptyScene, FigureStrip, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { sheetLabel, sheetTone } from "@/components/app/status";
import { TimesheetGrid, type Entry } from "@/components/app/timesheet-grid";
import { buttonClass } from "@/components/ui/button";
import { CreateTimesheetModal } from "@/components/intern/create-timesheet-modal";
import { HoursHeatmap, type HeatDay } from "@/components/intern/timesheets/hours-heatmap";
import { requireRole } from "@/lib/auth";
import { dayDetails, editableDayStatus, engagementPeriods, timesheetPeriod, uncoveredParts, unfilledDays, type Period } from "@/lib/employer-timesheets";
import { formatJoiningDate, shortDate } from "@/lib/format";
import { isHiredProposal } from "@/lib/hire-status";
import { loadInternData } from "@/lib/intern-data";
import { hoursIn, isAcceptedStatus, toArray, type ProposalRow, type TimesheetRow } from "@/lib/journey";
import { realJoiningDay } from "@/lib/intern-offer-view";
import { parseOffer } from "@/lib/offer";
import { formatPeriodDays, isoDay, periodDays, todayIst } from "@/lib/timesheet-days";
import { cn } from "@/lib/utils";

import { DeleteSheetButton } from "./delete-sheet-button";
import { SheetView } from "./sheet-view";

export const metadata: Metadata = {
  title: "Timesheets",
  robots: { index: false, follow: false },
};

/**
 * Timesheets (legacy timesheets.tsx, INW-07).
 *
 * The list: every hired internship (the company has paid; full-time offers
 * have no timesheets) with its sheet count, and for the one picked
 * (`?proposalId`, the legacy deep link) every sheet with Edit / View and,
 * per the legacy rule, Delete for a draft or Withdraw for one waiting on the
 * manager. `?sheet=<id>` opens one sheet: the editor while it is a draft or
 * sent back, otherwise every day read only (INW-08).
 *
 * Logging hours opens only once the employer has paid (bug sheet 7, S1 r65
 * over r55): an accepted offer still waiting on payment gets an explanation,
 * not a timesheet.
 */
export default async function InternTimesheets({
  searchParams,
}: {
  searchParams: Promise<{ proposalId?: string | string[]; sheet?: string | string[] }>;
}) {
  const [session, params] = await Promise.all([requireRole("intern"), searchParams]);
  const wantProposal = first(params.proposalId);
  const wantSheet = first(params.sheet);

  const data = await loadInternData(session.uid);
  const hires = data.proposals
    .filter((p) => isHiredProposal(p) && !parseOffer(p.offerDetails, p.currency).fullTime)
    .sort((a, b) => (b.hiredAt ?? b.createdAt).getTime() - (a.hiredAt ?? a.createdAt).getTime());
  const sheetsOf = (proposalId: string) =>
    data.timesheets
      .filter((t) => t.proposalId === proposalId)
      .sort((a, b) => (b.periodStart?.getTime() ?? 0) - (a.periodStart?.getTime() ?? 0));
  const company = (p: ProposalRow) => data.names[p.employerId] || "Your company";
  const role = (p: ProposalRow) => parseOffer(p.offerDetails, p.currency).roleTitle || "Internship";

  // ── One sheet ───────────────────────────────────────────────────────
  const openSheet = wantSheet ? data.timesheets.find((t) => t.id === wantSheet) ?? null : null;
  if (wantSheet) {
    const owner = openSheet ? data.proposals.find((p) => p.id === openSheet.proposalId) ?? null : null;
    const backHref = owner ? `/intern/timesheets?proposalId=${encodeURIComponent(owner.id)}` : "/intern/timesheets";
    if (!openSheet) {
      return (
        <div>
          <BackLink href="/intern/timesheets" />
          <PageHead title="Timesheet not found" />
          <EmptyScene
            title="This timesheet is not here any more"
            body="It may have been deleted or withdrawn. Every timesheet you still have is on the timesheets page."
            next={{ label: "See your timesheets", href: "/intern/timesheets" }}
          />
        </div>
      );
    }
    const status = (openSheet.status ?? "draft").toLowerCase();
    const editable = status === "draft" || status === "rejected";
    return (
      <div>
        <BackLink href={backHref} />
        <PageHead
          title={formatPeriodDays(openSheet.periodStart, openSheet.periodEnd) || "Timesheet"}
          lede={
            (owner ? `${role(owner)} at ${company(owner)}. ` : "") +
            (editable
              ? "Pick a status for every day. Hours and a line on what you did are optional. You can send it on the last day of the period, once every day is marked."
              : status === "approved"
                ? "Approved by your manager. Every day is shown as it was approved."
                : "With your manager. Every day is shown as it stands now.")
          }
          action={<Pill tone={sheetTone(openSheet.status)}>{sheetLabel(openSheet.status)}</Pill>}
        />
        {editable ? (
          <TimesheetGrid
            key={openSheet.id}
            timesheetId={openSheet.id}
            periodStart={openSheet.periodStart?.toISOString() ?? null}
            periodEnd={openSheet.periodEnd?.toISOString() ?? null}
            initialEntries={normaliseEntries(openSheet.entries)}
            status={status}
            managerNote={openSheet.managerNote}
            internNote={openSheet.internNote}
            backHref={backHref}
          />
        ) : (
          <SheetView sheet={openSheet} backHref={backHref} />
        )}
      </div>
    );
  }

  // ── Nothing to log yet ─────────────────────────────────────────────
  if (hires.length === 0) {
    const waitingOnPayment = data.proposals.find((p) => isAcceptedStatus(p.status) && !isHiredProposal(p));
    return (
      <div>
        <PageHead title="Timesheets" lede="Mark each day of your internship and send it to your manager for approval." />
        {waitingOnPayment ? (
          <EmptyScene
            art
            title="Timesheets open once the company pays"
            body={`You accepted the ${role(waitingOnPayment)} offer. Logging hours opens as soon as the company completes the payment, and you will get a notification when it does.`}
            who="Waiting on the company"
            next={{ label: "See the offer", href: `/intern/proposals/${waitingOnPayment.id}` }}
          />
        ) : (
          <EmptyScene
            art
            title="No internship to log yet"
            body="A timesheet opens once a company hires you: you accept their offer and they complete the payment. You then mark each day as you go."
            next={{ label: "See your offers", href: "/intern/proposals" }}
          />
        )}
      </div>
    );
  }

  // ── The list ───────────────────────────────────────────────────────
  const selected = hires.find((p) => p.id === wantProposal) ?? hires[0];
  const sheets = sheetsOf(selected.id);
  const offer = parseOffer(selected.offerDetails, selected.currency);
  const today = todayIst();
  const taken: Period[] = sheets
    .filter((s) => s.periodStart && s.periodEnd)
    .map((s) => ({ start: isoDay(s.periodStart!), end: isoDay(s.periodEnd!) }));
  const next = timesheetPeriod(null, offer.startDate, offer.months, today, taken);
  const upcoming =
    "error" in next && offer.startDate
      ? engagementPeriods(offer.startDate, offer.months)
          .flatMap((p) => uncoveredParts(p, taken))
          .find((p) => p.start > today) ?? null
      : null;
  const createButton =
    "error" in next ? null : (
      <CreateTimesheetModal
        proposalId={selected.id}
        roleTitle={role(selected)}
        company={company(selected)}
        period={formatPeriodDays(next.start, next.end)}
      />
    );

  const joiningDay = realJoiningDay(offer);
  const periods = offer.startDate ? engagementPeriods(offer.startDate, offer.months) : [];
  const nextLine =
    "error" in next
      ? upcoming
        ? `Your next timesheet covers ${formatPeriodDays(upcoming.start, upcoming.end)} and opens on its first day.`
        : next.error
      : `Your next timesheet covers ${formatPeriodDays(next.start, next.end)}.`;

  return (
    <div>
      <SignatureHero
        className="mb-6 lg:mb-8"
        title="Timesheets"
        lede={`${role(selected)} at ${company(selected)}, ${offer.months} month${offer.months === 1 ? "" : "s"}${joiningDay ? ` from ${formatJoiningDate(joiningDay)}` : ""}.`}
      />

      {hires.length > 1 ? (
        <nav aria-label="Your internships" className="mb-6 lg:mb-8">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {hires.map((p) => {
              const on = p.id === selected.id;
              const count = sheetsOf(p.id).length;
              return (
                <li key={p.id}>
                  <Link
                    href={`/intern/timesheets?proposalId=${encodeURIComponent(p.id)}`}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "apple-spring flex min-h-11 items-start justify-between gap-3 rounded-apple-xl border p-4",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                      on ? "border-brand-400 bg-brand-50/70" : "border-ink-200/80 bg-surface-raised hover:border-brand-300",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium text-ink-900">{role(p)}</span>
                      <span className="mt-1 block break-words text-xs text-text-subtle">{company(p)}</span>
                    </span>
                    <Pill tone={on ? "live" : "neutral"}>
                      <span className="nums">{count}</span> sheet{count === 1 ? "" : "s"}
                    </Pill>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {/* The real next action, before anything to read. */}
      <Surface className="mb-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between lg:mb-6 lg:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
            <CalendarClock className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-ink-900">Next timesheet</p>
            <p className="mt-0.5 text-pretty text-lg font-semibold leading-snug text-ink-900">{nextLine}</p>
          </div>
        </div>
        {createButton ? <div className="shrink-0">{createButton}</div> : null}
      </Surface>

      {sheets.length > 0 ? (
        <SheetsOverview sheets={sheets} periods={periods} today={today} />
      ) : (
      <div className="grid gap-x-8 gap-y-6 lg:gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          <EmptyScene
            title="No timesheet started yet"
            body={
              "error" in next
                ? `${next.error}${upcoming ? ` Your first one opens on ${formatPeriodStart(upcoming.start)}.` : ""}`
                : `Start your first one with New timesheet above. It covers ${formatPeriodDays(next.start, next.end)}.`
            }
          />
        </section>

        <aside className="space-y-4">
          {/* The tutorial is for before the first sheet, not a permanent rail. */}
          <Surface className="p-5 lg:p-6">
            <SectionHead title="How it works" />
            <ol className="space-y-3">
              {[
                "Start a timesheet. Each one covers a month of your internship, counted from your joining date.",
                "Mark every day Present, Absent, Fixed off or Holiday. Weekends and public holidays come pre-marked.",
                "You can send it on the last day of the period, once every day is marked. Your manager approves it or sends it back with a note.",
                "Changed your mind? Withdraw a sheet that is still waiting, fix it, and send it again.",
              ].map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span className="nums grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">
                    {i + 1}
                  </span>
                  <span className="text-pretty text-sm text-ink-700">{line}</span>
                </li>
              ))}
            </ol>
          </Surface>
        </aside>
      </div>
      )}
    </div>
  );
}

const STATE_LINE: Record<string, string> = {
  draft: "Open. Mark each day, then submit it for review.",
  rejected: "Sent back by your manager. Fix it and send it again.",
  submitted: "Submitted, waiting for review. Edits are locked until your manager replies.",
  approved: "Approved by your manager.",
  paid: "Paid.",
};

/**
 * The current period first, with where it stands in one sentence, then every
 * sheet as an aligned row (period, hours, status, one action), then the
 * hours heatmap for the whole internship.
 */
function SheetsOverview({ sheets, periods, today }: { sheets: TimesheetRow[]; periods: Period[]; today: string }) {
  const days = heatDays(sheets, periods);
  const logged = Number(days.reduce((n, d) => n + d.hours, 0).toFixed(1));
  const present = days.filter((d) => d.status === "Present" || d.hours > 0).length;
  const approved = Number(sheets.filter((t) => t.status === "approved").reduce((n, t) => n + hoursIn(t), 0).toFixed(1));
  const current = sheets.find((t) => ["draft", "rejected", "submitted"].includes((t.status ?? "draft").toLowerCase())) ?? sheets[0];
  const rest = sheets.filter((t) => t.id !== current.id);

  return (
    <Stagger className="space-y-4 lg:space-y-6">
      <FigurePanel>
        <FigureStrip tone="dark" className="max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
          <BigFigure tone="dark" label="Hours logged" value={<CountUp value={logged} decimals={Number.isInteger(logged) ? 0 : 1} duration={1.2} />} hint="Whole internship" />
          <BigFigure tone="dark" label="Days worked" value={<CountUp value={present} duration={1} />} />
          <BigFigure tone="dark" label="Hours approved" value={<CountUp value={approved} decimals={Number.isInteger(approved) ? 0 : 1} duration={1.2} />} hint="Counts toward your stipend" />
        </FigureStrip>
      </FigurePanel>
      <Surface as="section" aria-label="Current period" className="p-5 lg:p-6">
        <SectionHead title="Current period" />
        <CurrentSheet sheet={current} />
      </Surface>

      {rest.length > 0 ? (
        <Surface as="section" aria-label="Past timesheets" className="p-5 lg:p-6">
          <SectionHead title="Past timesheets" hint="Newest first" />
          <ul className="divide-y divide-ink-200/70">
            {rest.map((sheet) => (
              <SheetRow key={sheet.id} sheet={sheet} />
            ))}
          </ul>
        </Surface>
      ) : null}

      <Surface as="section" aria-labelledby="heat-title" className="p-4 sm:p-6">
        <h2 id="heat-title" className="mb-5 text-lg font-semibold tracking-[-0.01em] text-ink-900">
          Hours by day
        </h2>
        <HoursHeatmap days={days} today={today} />
      </Surface>
    </Stagger>
  );
}

function sheetAction(sheet: TimesheetRow, days: string[]): { label: string; primary: boolean } {
  const status = (sheet.status ?? "draft").toLowerCase();
  const marked = days.length - unfilledDays(days, sheet.entries).length;
  if (status === "rejected") return { label: "Fix and resend", primary: true };
  if (status === "draft") return { label: marked === days.length ? "Submit for review" : "Mark your days", primary: true };
  return { label: "View", primary: false };
}

function CurrentSheet({ sheet }: { sheet: TimesheetRow }) {
  const status = (sheet.status ?? "draft").toLowerCase();
  const days = periodDays(sheet.periodStart, sheet.periodEnd);
  const marked = days.length - unfilledDays(days, sheet.entries).length;
  const href = `/intern/timesheets?sheet=${encodeURIComponent(sheet.id)}`;
  const action = sheetAction(sheet, days);
  const editable = status === "draft" || status === "rejected";
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="nums text-xl font-semibold text-ink-900">{formatPeriodDays(sheet.periodStart, sheet.periodEnd) || "A period"}</p>
          <p className="mt-1 text-pretty text-sm text-ink-700">{STATE_LINE[status] ?? STATE_LINE.draft}</p>
          {editable ? (
            <p className="nums mt-1 text-sm text-text-subtle">
              {marked} of {days.length} days marked · {Number(hoursIn(sheet).toFixed(1))} h so far
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={sheetTone(sheet.status)}>{sheetLabel(sheet.status)}</Pill>
          <Link
            href={href}
            className={
              action.primary
                ? buttonClass({ variant: status === "rejected" ? "accent" : "primary", size: "md" })
                : "inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
            }
          >
            {action.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          {status === "draft" || status === "submitted" ? <DeleteSheetButton timesheetId={sheet.id} withdraw={status === "submitted"} /> : null}
        </div>
      </div>
      {editable && sheet.managerNote ? (
        <div className="mt-4 rounded-apple-sm bg-accent-50 px-4 py-3">
          <p className="text-sm font-semibold text-accent-700">From your manager</p>
          <p className="mt-1 whitespace-pre-wrap text-pretty text-sm text-ink-800">{sheet.managerNote}</p>
        </div>
      ) : null}
    </div>
  );
}

/** A past sheet: period, hours, status and one action, aligned on every row. */
function SheetRow({ sheet }: { sheet: TimesheetRow }) {
  const days = periodDays(sheet.periodStart, sheet.periodEnd);
  const href = `/intern/timesheets?sheet=${encodeURIComponent(sheet.id)}`;
  const action = sheetAction(sheet, days);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_5rem_9rem_auto]">
      <span className="nums min-w-0 text-sm font-medium text-ink-900">{formatPeriodDays(sheet.periodStart, sheet.periodEnd) || "A period"}</span>
      <span className="nums text-right text-sm text-ink-900 sm:order-none">{Number(hoursIn(sheet).toFixed(1))} h</span>
      <span className="col-start-1 sm:col-start-auto">
        <Pill tone={sheetTone(sheet.status)}>{sheetLabel(sheet.status)}</Pill>
      </span>
      <Link
        href={href}
        className={
          action.primary
            ? buttonClass({ variant: "primary", size: "sm", className: "justify-self-end" })
            : "inline-flex min-h-11 items-center justify-self-end px-1 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        }
      >
        {action.label}
      </Link>
    </li>
  );
}

/** Every day of the internship (and of any sheet outside it), with what its sheet says. */
function heatDays(sheets: TimesheetRow[], periods: Period[]): HeatDay[] {
  const byDate = new Map<string, HeatDay>();
  for (const s of sheets) {
    const sheet = sheetLabel(s.status);
    // Hours follow the shared day rule (a Present day with none is 8 h), so this total agrees with every other.
    const hours = new Map(dayDetails(s.entries, s.periodStart, s.periodEnd).map((d) => [d.date, d.hours]));
    for (const date of periodDays(s.periodStart, s.periodEnd)) byDate.set(date, { date, hours: hours.get(date) ?? 0, status: "", sheet });
    for (const e of toArray<Record<string, unknown>>(s.entries)) {
      const d = e && typeof e.date === "string" ? byDate.get(e.date.slice(0, 10)) : undefined;
      if (!d) continue;
      d.status = editableDayStatus(e.status);
    }
  }
  const covered = [...byDate.keys()].sort();
  const bounds = [periods[0]?.start, periods.at(-1)?.end, covered[0], covered.at(-1)].filter((x): x is string => !!x).sort();
  if (bounds.length === 0) return [];
  return periodDays(bounds[0], bounds[bounds.length - 1]).map((date) => byDate.get(date) ?? { date, hours: 0, status: "", sheet: null });
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="apple-spring mb-5 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All timesheets
    </Link>
  );
}

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function formatPeriodStart(iso: string): string {
  return shortDate(new Date(`${iso}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Turns the stored jsonb into typed entries, dropping anything malformed. */
function normaliseEntries(entries: unknown): Entry[] {
  return toArray<Record<string, unknown>>(entries)
    .filter((e) => e && typeof e.date === "string")
    .map((e) => ({
      date: String(e.date).slice(0, 10),
      hours: typeof e.hours === "number" ? e.hours : 0,
      note: typeof e.note === "string" ? e.note : "",
      status: typeof e.status === "string" ? e.status : "",
    }));
}
