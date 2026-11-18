import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarClock } from "lucide-react";

import { EmptyScene, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { sheetLabel, sheetTone } from "@/components/app/status";
import { TimesheetGrid, type Entry } from "@/components/app/timesheet-grid";
import { buttonClass } from "@/components/ui/button";
import { CreateTimesheetModal } from "@/components/intern/create-timesheet-modal";
import { HoursHeatmap, type HeatDay } from "@/components/intern/timesheets/hours-heatmap";
import { requireRole } from "@/lib/auth";
import { dayDetails, editableDayStatus, engagementPeriods, timesheetPeriod, uncoveredParts, unfilledDays, type Period } from "@/lib/employer-timesheets";
import { formatDate, shortDate } from "@/lib/format";
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
      <PageHead
        title="Timesheets"
        lede={`${role(selected)} at ${company(selected)}, ${offer.months} month${offer.months === 1 ? "" : "s"}${joiningDay ? ` from ${formatDate(joiningDay)}` : ""}.`}
      />

      {hires.length > 1 ? (
        // Many placements share a role and a company, so each option carries its start date; a plain GET form works without script.
        <form method="get" className="mb-6 flex flex-wrap items-end gap-3 lg:mb-8">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="ts-internship" className="text-sm font-medium text-ink-800">
              Internship <span className="nums font-normal text-ink-600">({hires.length})</span>
            </label>
            <select
              id="ts-internship"
              name="proposalId"
              defaultValue={selected.id}
              className="mt-1.5 h-11 w-full min-w-0 rounded-apple-sm border border-ink-200 bg-white px-3 text-base text-ink-900 outline-none hover:border-ink-300 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20 sm:text-sm"
            >
              {hires.map((p) => {
                const o = parseOffer(p.offerDetails, p.currency);
                const from = realJoiningDay(o);
                const count = sheetsOf(p.id).length;
                return (
                  <option key={p.id} value={p.id}>
                    {/* The date first: on a phone the select cuts the end, and the date is what tells two "Product Intern" rows apart. */}
                    {`${from ? `${formatDate(from)} · ` : ""}${role(p)}, ${company(p)} (${count} sheet${count === 1 ? "" : "s"})`}
                  </option>
                );
              })}
            </select>
          </div>
          <button type="submit" className={buttonClass({ variant: "outline", size: "md", className: "h-11" })}>
            Show
          </button>
        </form>
      ) : null}

      {/* The real next action, before anything to read. */}
      <section
        data-first-content
        aria-label="Next timesheet"
        className="mb-6 flex flex-col gap-4 border-y border-ink-200/70 py-5 sm:flex-row sm:items-center sm:justify-between lg:mb-8"
      >
        <div className="flex min-w-0 items-start gap-3">
          <CalendarClock className="mt-1 size-5 shrink-0 text-brand-700" aria-hidden />
          <p className="text-pretty text-base font-medium leading-snug text-ink-900 sm:text-lg">{nextLine}</p>
        </div>
        {createButton ? <div className="shrink-0">{createButton}</div> : null}
      </section>

      {sheets.length > 0 ? (
        <SheetsOverview sheets={sheets} periods={periods} today={today} />
      ) : (
        // The next-timesheet line above already says when the first one opens; this is the how, once.
        <section aria-labelledby="ts-how" className="max-w-2xl">
          <h2 id="ts-how" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
            How timesheets work
          </h2>
          <ol className="mt-3 space-y-3">
            {[
              "Start a timesheet. Each one covers a month of your internship, counted from your joining date.",
              "Mark every day Present, Absent, Fixed off or Holiday. Weekends and public holidays come pre-marked.",
              "You can send it on the last day of the period, once every day is marked. Your manager approves it or sends it back with a note.",
              "Changed your mind? Withdraw a sheet that is still waiting, fix it, and send it again.",
            ].map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="nums grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">{i + 1}</span>
                <span className="text-pretty text-sm text-ink-700">{line}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/**
 * The internship's days as a heatmap of hours, beside every sheet on a
 * rail from sent to approved. The heatmap answers "what have I logged";
 * the rail answers "where is each month".
 */
function SheetsOverview({ sheets, periods, today }: { sheets: TimesheetRow[]; periods: Period[]; today: string }) {
  const days = heatDays(sheets, periods);
  const logged = Number(days.reduce((n, d) => n + d.hours, 0).toFixed(1));
  const present = days.filter((d) => d.status === "Present" || d.hours > 0).length;
  const approved = Number(sheets.filter((t) => t.status === "approved").reduce((n, t) => n + hoursIn(t), 0).toFixed(1));

  return (
    <div className="grid items-start gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Surface as="section" aria-labelledby="heat-title" className="p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="heat-title" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
            Hours by day
          </h2>
          <p className="nums text-sm text-ink-600">
            <span className="font-semibold text-ink-900">{logged} h</span> logged · {present} day{present === 1 ? "" : "s"} worked
            {approved > 0 ? <> · {approved} h approved</> : null}
          </p>
        </div>
        <HoursHeatmap days={days} today={today} />
      </Surface>

      <Surface as="section" aria-label="Every timesheet" className="p-5 lg:p-6">
        <SectionHead title="Every timesheet" hint="Newest first" />
        <ol className="relative space-y-6 before:absolute before:inset-y-2 before:left-[0.4375rem] before:w-px before:bg-ink-200">
          {sheets.map((sheet) => (
            <SheetStep key={sheet.id} sheet={sheet} />
          ))}
        </ol>
      </Surface>
    </div>
  );
}

const DOT: Record<string, string> = {
  approved: "bg-success",
  submitted: "bg-accent-500",
  rejected: "bg-info",
  draft: "bg-surface-raised ring-2 ring-inset ring-ink-400",
};

/** One sheet on the rail: its period, where it stands, the dates it moved, and its one action. */
function SheetStep({ sheet }: { sheet: TimesheetRow }) {
  const status = (sheet.status ?? "draft").toLowerCase();
  const editable = status === "draft" || status === "rejected";
  const days = periodDays(sheet.periodStart, sheet.periodEnd);
  const marked = days.length - unfilledDays(days, sheet.entries).length;
  const href = `/intern/timesheets?sheet=${encodeURIComponent(sheet.id)}`;
  const steps = [
    { label: "Started", at: sheet.createdAt },
    sheet.submittedAt ? { label: "Sent", at: sheet.submittedAt } : null,
    status === "approved" ? { label: "Approved", at: sheet.approvedAt } : null,
    status === "rejected" ? { label: "Sent back", at: sheet.rejectedAt } : null,
  ].filter((x): x is { label: string; at: Date | null } => x !== null);

  return (
    <li className="relative pl-8">
      <span aria-hidden className={cn("absolute left-0 top-1.5 size-3.5 rounded-full ring-4 ring-surface-raised", DOT[status] ?? DOT.draft)} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          href={href}
          className="nums rounded-apple-sm text-base font-medium text-ink-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {formatPeriodDays(sheet.periodStart, sheet.periodEnd) || "A period"}
        </Link>
        <span className="nums text-sm font-medium text-ink-900">{Number(hoursIn(sheet).toFixed(1))} h</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Pill tone={sheetTone(sheet.status)}>{sheetLabel(sheet.status)}</Pill>
        {editable ? <span className="nums text-xs text-text-subtle">{marked} of {days.length} days marked</span> : null}
      </div>
      <ol className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-600" aria-label="History">
        {steps.map((st, i) => (
          <li key={st.label} className="flex items-center gap-1.5">
            {i > 0 ? <ArrowRight aria-hidden className="size-3 text-text-subtle" /> : null}
            <span>
              {st.label} <span className="nums font-medium text-ink-800">{st.at ? dayMonth(st.at) : "–"}</span>
            </span>
          </li>
        ))}
      </ol>

      {editable && sheet.managerNote ? (
        <div className="mt-3 rounded-apple-sm bg-accent-50 px-4 py-3">
          <p className="text-xs font-semibold text-accent-700">From your manager</p>
          <p className="mt-1 whitespace-pre-wrap text-pretty text-sm text-ink-800">{sheet.managerNote}</p>
        </div>
      ) : null}

      {editable || status === "submitted" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {editable ? (
            <Link href={href} className={buttonClass({ variant: status === "rejected" ? "accent" : "outline", size: "sm" })}>
              {status === "rejected" ? "Fix and resend" : marked === days.length ? "Check and send" : "Mark your days"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
          {status === "draft" || status === "submitted" ? <DeleteSheetButton timesheetId={sheet.id} withdraw={status === "submitted"} /> : null}
        </div>
      ) : null}
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

function dayMonth(d: Date): string {
  return shortDate(d, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
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
