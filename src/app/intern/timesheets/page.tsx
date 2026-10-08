import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

import { EmptyScene, PageHead, Pill, SectionHead, Surface, type Tone } from "@/components/app/primitives";
import { TimesheetGrid, type Entry } from "@/components/app/timesheet-grid";
import { CreateTimesheetModal } from "@/components/intern/create-timesheet-modal";
import { getSession } from "@/lib/auth";
import { loadInternData } from "@/lib/intern-data";
import { formatDayLabel, formatMonth } from "@/lib/format";
import { hoursIn, toArray, workLines } from "@/lib/journey";

export const metadata: Metadata = {
  title: "Timesheets",
  robots: { index: false, follow: false },
};

/**
 * Timesheets.
 *
 * The old page rendered a list of date ranges and a submit button, and had no
 * way to enter hours at all. It could submit drafts that something else had
 * created. A candidate doing twenty hours a week had nowhere to record them.
 *
 * Two things are deliberately on this screen rather than hidden behind a tab.
 *
 * First, the current period opens for editing, because that is the thing
 * somebody is here to do. Second, every past period is right there with what
 * happened to it, because the thing candidates fear is that a period
 * disappears. Nothing disappears. A rejected period keeps its manager's note
 * and stays editable.
 */
export default async function InternTimesheets() {
  const session = await getSession();
  if (!session) return null;

  const data = await loadInternData(session.uid);
  const sheets = data.timesheets;

  const acceptedProposals = data.proposals
    .filter((p) => p.status === "accepted" || p.status === "hired" || p.hiredAt !== null)
    .map((p) => ({
      id: p.id,
      companyName: data.names[p.employerId] || "Your Employer",
      roleTitle: (p.offerDetails as { roleTitle?: string } | null)?.roleTitle,
    }));

  const current =
    sheets.find((t) => t.status === "draft") ??
    sheets.find((t) => t.status === "submitted") ??
    sheets.find((t) => t.status === "rejected") ??
    sheets[0] ??
    null;

  const rest = sheets.filter((s) => s.id !== current?.id);
  const expectedHours = weeklyHours(data.engagement?.offerDetails ?? null);

  return (
    <div>
      <PageHead
        title="Timesheets"
        lede="Record what you worked on each day. Everything saves on its own, and nothing disappears after you send it."
        action={
          acceptedProposals.length > 0 ? (
            <CreateTimesheetModal proposals={acceptedProposals} />
          ) : null
        }
      />

      {sheets.length === 0 ? (
        acceptedProposals.length > 0 ? (
          <Surface className="p-8 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Clock className="size-6" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-ink-900">No timesheets started yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
              You have an active engagement with <strong>{acceptedProposals[0].companyName}</strong>.
              Initialize your monthly timesheet to start logging hours worked each day.
            </p>
            <div className="mt-6 flex justify-center">
              <CreateTimesheetModal proposals={acceptedProposals} />
            </div>
          </Surface>
        ) : (
          <EmptyScene
            art
            title="No timesheets open"
            body="A timesheet opens once you have accepted an offer. You will get one for every month you work, and you can log hours as you go rather than at the end."
            who="Your manager approves them"
            next={{ label: "See your offers", href: "/intern/proposals" }}
          />
        )
      ) : (
        <div className="space-y-10">
          {current ? (
            <section>
              <SectionHead
                title={
                  current.status === "submitted"
                    ? "Waiting for approval"
                    : current.status === "rejected"
                      ? "Needs another look"
                      : "Current period"
                }
                hint={
                  current.periodStart
                    ? `${formatMonth(current.periodStart)}${current.periodEnd && current.periodStart.toISOString().slice(0,7) !== current.periodEnd.toISOString().slice(0,7) ? ` to ${formatMonth(current.periodEnd)}` : ""}`
                    : undefined
                }
                action={<Pill tone={sheetTone(current.status)}>{sheetLabel(current.status)}</Pill>}
              />

              {current.status === "submitted" ? (
                <Surface className="p-5">
                  <p className="text-pretty text-sm leading-relaxed text-ink-700">
                    Sent {formatDayLabel(current.submittedAt ?? current.createdAt)}. Reviews on this
                    platform usually take about two working days, and you will be notified either
                    way. Your hours are read only until your manager responds.
                  </p>
                  <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 border-t border-ink-100 pt-4">
                    <Stat label="Hours" value={String(hoursIn(current))} />
                    <Stat label="Days worked" value={String(toArray(current.entries).filter((e) => Number((e as { hours?: number }).hours) > 0).length)} />
                    <Stat
                      label="Status"
                      value={current.status === "submitted" ? "With your manager" : sheetLabel(current.status)}
                    />
                  </dl>
                </Surface>
              ) : (
                <TimesheetGrid
                  key={current.id}
                  timesheetId={current.id}
                  periodStart={current.periodStart?.toISOString() ?? null}
                  periodEnd={current.periodEnd?.toISOString() ?? null}
                  initialEntries={normaliseEntries(current.entries)}
                  status={current.status ?? "draft"}
                  managerNote={current.managerNote}
                  internNote={current.internNote}
                  expectedHours={expectedHours}
                />
              )}
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section>
              <SectionHead
                title="Previous periods"
                hint="Kept here permanently, including any that needed a change."
              />
              <ul className="space-y-3">
                {rest.map((sheet) => {
                  const hours = hoursIn(sheet);
                  const work = workLines(sheet, 2);
                  return (
                    <li key={sheet.id}>
                      <Surface className="p-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <h3 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
                            {sheet.periodStart ? formatMonth(sheet.periodStart) : "A period"}
                          </h3>
                          <Pill tone={sheetTone(sheet.status)}>{sheetLabel(sheet.status)}</Pill>
                        </div>

                        <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2">
                          <Stat label="Hours" value={String(hours)} />
                          {sheet.approvedAt ? (
                            <Stat label="Approved" value={formatDayLabel(sheet.approvedAt)} />
                          ) : sheet.submittedAt ? (
                            <Stat label="Sent" value={formatDayLabel(sheet.submittedAt)} />
                          ) : null}
                          {sheet.rejectedAt ? (
                            <Stat label="Sent back" value={formatDayLabel(sheet.rejectedAt)} />
                          ) : null}
                        </dl>

                        {work.length > 0 ? (
                          <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-600">
                            <span className="font-medium text-ink-800">Worked on</span> {work.join(", ")}.
                          </p>
                        ) : null}

                        {sheet.managerNote ? (
                          <div className="mt-3 rounded-xl border-l-2 border-accent-400 bg-accent-100/40 py-3 pl-4 pr-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-700">
                              From your manager
                            </p>
                            <p className="mt-1.5 text-pretty text-sm leading-relaxed text-ink-800">
                              {sheet.managerNote}
                            </p>
                          </div>
                        ) : null}
                      </Surface>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section>
            <Surface className="p-5">
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
                If something looks wrong
              </h2>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
                A period sent back is not a mark against you. Your manager has to say what they need
                changed, you fix it, and it goes back into the same period rather than into a new
                one. Nothing is lost while you sort it out.
              </p>
              <Link
                href="/intern/notifications"
                className="mt-4 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                See what has been said about your work
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Surface>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">{value}</dd>
    </div>
  );
}

function sheetLabel(status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "Approved";
    case "submitted":
      return "Sent for approval";
    case "rejected":
      return "Sent back to you";
    case "draft":
      return "Not sent yet";
    default:
      return "Unknown";
  }
}

function sheetTone(status: string | null): Tone {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "paid";
    case "submitted":
      return "waiting";
    case "rejected":
      return "new";
    default:
      return "neutral";
  }
}

/** Turns the stored jsonb into typed entries, dropping anything malformed. */
function normaliseEntries(entries: unknown): Entry[] {
  return toArray<Record<string, unknown>>(entries)
    .filter((e) => typeof e.date === "string")
    .map((e) => ({
      date: String(e.date),
      hours: typeof e.hours === "number" ? e.hours : 0,
      note: typeof e.note === "string" ? e.note : "",
    }));
}

function weeklyHours(offer: Record<string, unknown> | null): number | null {
  if (!offer) return null;
  const perWeek = offer.hoursPerWeek;
  const weeks = typeof offer.durationWeeks === "number" ? offer.durationWeeks : null;
  if (typeof perWeek !== "number" || weeks === null) return null;
  return Math.round((perWeek * Math.min(weeks, 1)) as number);
}