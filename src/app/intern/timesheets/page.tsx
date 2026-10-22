import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DetailRow, EmptyScene, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { sheetLabel, sheetTone } from "@/components/app/status";
import { TimesheetGrid, type Entry } from "@/components/app/timesheet-grid";
import { CreateTimesheetModal } from "@/components/intern/create-timesheet-modal";
import { requireRole } from "@/lib/auth";
import { parseOffer } from "@/lib/offer";
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
  const session = await requireRole("intern");

  const data = await loadInternData(session.uid);
  const sheets = data.timesheets;

  // Same gate as the create API: accepted or hired, never a full-time offer.
  const acceptedProposals = data.proposals
    .filter((p) => (p.status === "accepted" || p.status === "hired") && !parseOffer(p.offerDetails, p.currency).fullTime)
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
          <div>
            <EmptyScene
              art
              title="No timesheets started yet"
              body={`You have an active engagement with ${acceptedProposals[0].companyName}. Initialize your monthly timesheet to start logging hours worked each day.`}
            />
            <div className="mt-4 flex justify-center">
              <CreateTimesheetModal proposals={acceptedProposals} />
            </div>
          </div>
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
                  <div className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
                    <DetailRow label="Hours" value={String(hoursIn(current))} mono />
                    <DetailRow label="Days worked" value={String(toArray(current.entries).filter((e) => Number((e as { hours?: number }).hours) > 0).length)} mono />
                    <DetailRow
                      label="Status"
                      value={current.status === "submitted" ? "With your manager" : sheetLabel(current.status)}
                    />
                  </div>
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
                        <SectionHead
                          title={sheet.periodStart ? formatMonth(sheet.periodStart) : "A period"}
                          action={<Pill tone={sheetTone(sheet.status)}>{sheetLabel(sheet.status)}</Pill>}
                        />

                        <div className="mt-1 divide-y divide-ink-100 border-t border-ink-100">
                          <DetailRow label="Hours" value={String(hours)} mono />
                          {sheet.approvedAt ? (
                            <DetailRow label="Approved" value={formatDayLabel(sheet.approvedAt)} />
                          ) : sheet.submittedAt ? (
                            <DetailRow label="Sent" value={formatDayLabel(sheet.submittedAt)} />
                          ) : null}
                          {sheet.rejectedAt ? (
                            <DetailRow label="Sent back" value={formatDayLabel(sheet.rejectedAt)} />
                          ) : null}
                        </div>

                        {work.length > 0 ? (
                          <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-600">
                            <span className="font-medium text-ink-800">Worked on</span> {work.join(", ")}.
                          </p>
                        ) : null}

                        {sheet.managerNote ? (
                          <div className="mt-3 rounded-xl border-l-2 border-accent-400 bg-accent-100/40 py-3 pl-4 pr-3">
                            <p className="text-xs font-semibold text-accent-700">
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
              <SectionHead title="If something looks wrong" />
              <p className="text-pretty text-sm leading-relaxed text-ink-600">
                A period sent back is not a mark against you. Your manager has to say what they need
                changed, you fix it, and it goes back into the same period rather than into a new
                one. Nothing is lost while you sort it out.
              </p>
              <Link
                href="/intern/notifications"
                className="apple-spring apple-pressable mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
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

/** Turns the stored jsonb into typed entries, dropping anything malformed. */
function normaliseEntries(entries: unknown): Entry[] {
  return toArray<Record<string, unknown>>(entries)
    .filter((e) => typeof e.date === "string")
    .map((e) => ({
      date: String(e.date),
      hours: typeof e.hours === "number" ? e.hours : 0,
      note: typeof e.note === "string" ? e.note : "",
      status: typeof e.status === "string" ? e.status : "",
    }));
}

function weeklyHours(offer: Record<string, unknown> | null): number | null {
  if (!offer) return null;
  const perWeek = offer.hoursPerWeek;
  const weeks = typeof offer.durationWeeks === "number" ? offer.durationWeeks : null;
  if (typeof perWeek !== "number" || weeks === null) return null;
  return Math.round((perWeek * Math.min(weeks, 1)) as number);
}