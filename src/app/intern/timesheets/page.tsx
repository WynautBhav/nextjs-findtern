import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { EmptyScene, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { sheetLabel, sheetTone } from "@/components/app/status";
import { TimesheetGrid, type Entry } from "@/components/app/timesheet-grid";
import { buttonClass } from "@/components/ui/button";
import { CreateTimesheetModal } from "@/components/intern/create-timesheet-modal";
import { requireRole } from "@/lib/auth";
import { engagementPeriods, timesheetPeriod, uncoveredParts, unfilledDays, type Period } from "@/lib/employer-timesheets";
import { formatDayLabel, formatJoiningDate, shortDate } from "@/lib/format";
import { isHiredProposal } from "@/lib/hire-status";
import { loadInternData } from "@/lib/intern-data";
import { isAcceptedStatus, toArray, type ProposalRow, type TimesheetRow } from "@/lib/journey";
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
  const session = await requireRole("intern");
  const params = await searchParams;
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
          eyebrow={owner ? `${role(owner)} · ${company(owner)}` : "Timesheet"}
          title={formatPeriodDays(openSheet.periodStart, openSheet.periodEnd) || "Timesheet"}
          lede={
            editable
              ? "Pick a status for every day. Hours and a line on what you did are optional. Send it once every day is marked; you don't have to wait for the period to end."
              : status === "approved"
                ? "Approved by your manager. Every day is shown as it was approved."
                : "With your manager. Every day is shown as it stands now."
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

  return (
    <div>
      <PageHead
        title="Timesheets"
        lede="Mark each day of your internship and send it to your manager for approval."
        action={createButton}
      />

      {hires.length > 1 ? (
        <nav aria-label="Your internships" className="mb-8">
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
                      "apple-spring flex min-h-11 items-start justify-between gap-3 rounded-apple-lg border p-4 shadow-xs",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                      on ? "border-brand-400 bg-brand-50/70" : "border-ink-200/80 bg-white hover:border-brand-300",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9375rem] font-semibold text-ink-900">{role(p)}</span>
                      <span className="mt-0.5 block truncate text-sm text-ink-600">{company(p)}</span>
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

      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          <SectionHead
            title={`${role(selected)} · ${company(selected)}`}
            hint={`${offer.months} month${offer.months === 1 ? "" : "s"}${offer.startDate ? ` from ${formatJoiningDate(offer.startDate)}` : ""} · ${sheets.length} timesheet${sheets.length === 1 ? "" : "s"}`}
          />
          {sheets.length === 0 ? (
            <EmptyScene
              title="No timesheet started yet"
              body={
                "error" in next
                  ? `${next.error}${upcoming ? ` Your first one opens on ${formatPeriodStart(upcoming.start)}.` : ""}`
                  : `Start your first one with New timesheet above. It covers ${formatPeriodDays(next.start, next.end)}.`
              }
            />
          ) : (
            // One list of aligned rows, not a 150px card per month (critique).
            <Surface className="overflow-hidden">
              <ul className="divide-y divide-ink-100">
                {sheets.map((sheet) => (
                  <SheetRow key={sheet.id} sheet={sheet} />
                ))}
              </ul>
            </Surface>
          )}
        </section>

        <aside className="space-y-4">
          <Surface className="p-5">
            <SectionHead title="Next timesheet" />
            {"error" in next ? (
              <p className="text-pretty text-sm leading-relaxed text-ink-600">
                {upcoming ? `Covers ${formatPeriodDays(upcoming.start, upcoming.end)}; opens on its first day.` : next.error}
              </p>
            ) : (
              <>
                <p className="nums text-[0.9375rem] font-semibold text-ink-900">{formatPeriodDays(next.start, next.end)}</p>
                <p className="mt-1 text-sm text-ink-600">Ready to start now.</p>
              </>
            )}
          </Surface>
          {/* The tutorial is for before the first sheet, not a permanent rail. */}
          {sheets.length === 0 ? (
          <Surface className="p-5">
            <SectionHead title="How it works" />
            <ol className="space-y-3">
              {[
                "Start a timesheet. Each one covers a month of your internship, counted from your joining date.",
                "Mark every day Present, Absent, Fixed off or Holiday. Weekends and public holidays come pre-marked.",
                "Send it once every day is marked. Your manager approves it or sends it back with a note.",
                "Changed your mind? Withdraw a sheet that is still waiting, fix it, and send it again.",
              ].map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span className="nums mt-px grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">
                    {i + 1}
                  </span>
                  <span className="text-pretty text-sm leading-relaxed text-ink-700">{line}</span>
                </li>
              ))}
            </ol>
          </Surface>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** One sheet in the list, with the legacy actions for its status. */
function SheetRow({ sheet }: { sheet: TimesheetRow }) {
  const status = (sheet.status ?? "draft").toLowerCase();
  const editable = status === "draft" || status === "rejected";
  const days = periodDays(sheet.periodStart, sheet.periodEnd);
  const marked = days.length - unfilledDays(days, sheet.entries).length;
  const meta =
    status === "approved"
      ? `Approved ${whenLabel(sheet.approvedAt ?? sheet.submittedAt ?? sheet.createdAt)}`
      : status === "submitted"
        ? `Sent ${whenLabel(sheet.submittedAt ?? sheet.createdAt)} · with your manager`
        : status === "rejected"
          ? `Sent back${sheet.rejectedAt ? ` ${whenLabel(sheet.rejectedAt)}` : ""} · ${marked} of ${days.length} days marked`
          : `${marked} of ${days.length} days marked`;
  const href = `/intern/timesheets?sheet=${encodeURIComponent(sheet.id)}`;

  return (
    <li className="relative px-5 py-4 transition-colors hover:bg-ink-50/70">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {/* The row opens the sheet: the period's link is stretched over it. */}
          <Link
            href={href}
            className="nums text-[0.9375rem] font-semibold text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
          >
            {formatPeriodDays(sheet.periodStart, sheet.periodEnd) || "A period"}
          </Link>
          <p className="mt-0.5 text-sm text-ink-600">{meta}</p>
        </div>
        <div className="relative z-10 flex items-center gap-2">
          <Pill tone={sheetTone(sheet.status)}>{sheetLabel(sheet.status)}</Pill>
          {editable ? (
            <Link href={href} className={buttonClass({ variant: "primary", size: "sm" })}>
              Edit
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
          {status === "draft" || status === "submitted" ? (
            <DeleteSheetButton timesheetId={sheet.id} withdraw={status === "submitted"} />
          ) : null}
        </div>
      </div>

      {editable && sheet.managerNote ? (
        <div className="relative z-10 mt-3 rounded-apple-md bg-accent-50 px-4 py-2.5">
          <p className="text-xs font-semibold text-accent-700">From your manager</p>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-800">{sheet.managerNote}</p>
        </div>
      ) : null}
    </li>
  );
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

/** "today" / "3 days ago" mid-sentence; an absolute date keeps its capital. */
function whenLabel(value: Date | null): string {
  const label = formatDayLabel(value);
  return /^(Today|Yesterday|Tomorrow|In \d+ days|\d+ days ago)$/.test(label) ? label.toLowerCase() : label;
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
