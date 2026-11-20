import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EmptyScene, PageHead, Pill } from "@/components/app/primitives";
import { sheetLabel, sheetTone } from "@/components/app/status";
import { TimesheetGrid, type Entry } from "@/components/app/timesheet-grid";
import { CreateTimesheetModal } from "@/components/intern/create-timesheet-modal";
import { requireRole } from "@/lib/auth";
import { engagementPeriods, timesheetPeriod, uncoveredParts, type Period } from "@/lib/employer-timesheets";
import { formatDate } from "@/lib/format";
import { isHiredProposal } from "@/lib/hire-status";
import { loadInternData } from "@/lib/intern-data";
import { isAcceptedStatus, toArray, type ProposalRow } from "@/lib/journey";
import { realJoiningDay } from "@/lib/intern-offer-view";
import { parseOffer } from "@/lib/offer";
import { formatPeriodDays, isoDay, todayIst } from "@/lib/timesheet-days";

import { SheetView } from "./sheet-view";
import { TimesheetsList } from "./timesheets-list";

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
    <TimesheetsList
      lede={`${role(selected)} at ${company(selected)}, ${offer.months} month${offer.months === 1 ? "" : "s"}${joiningDay ? ` from ${formatDate(joiningDay)}` : ""}.`}
      options={hires.map((p) => {
        const o = parseOffer(p.offerDetails, p.currency);
        const from = realJoiningDay(o);
        const count = sheetsOf(p.id).length;
        // The date first: on a phone the select cuts the end, and the date is what tells two "Product Intern" rows apart.
        return { id: p.id, label: `${from ? `${formatDate(from)} · ` : ""}${role(p)}, ${company(p)} (${count} sheet${count === 1 ? "" : "s"})` };
      })}
      selectedId={selected.id}
      nextLine={nextLine}
      createButton={createButton}
      sheets={sheets}
      periods={periods}
      today={today}
    />
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
