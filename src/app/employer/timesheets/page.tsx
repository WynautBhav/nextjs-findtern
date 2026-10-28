import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowRight } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { dayDetails, formatDay, formatPeriod } from "@/lib/employer-timesheets";
import { StatusPill } from "@/components/employer/timesheet-parts";
import { EmptyScene, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Timesheets",
  robots: { index: false, follow: false },
};

type Row = {
  id: string;
  internId: string;
  name: string;
  initials: string;
  project: string | null;
  period: string;
  status: string;
  submittedAt: Date | null;
  present: number;
  hours: number;
  days: number;
  internNote: string | null;
};

/**
 * Timesheet review queue: the daily-use screen. What is waiting on you comes
 * first, oldest submission first, with one button each; everything else
 * follows newest first. Scoped by `timesheets.employer_id`, as legacy was.
 */
export default async function EmployerTimesheets() {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const uid = session.uid;

  let rows: Row[] = [];
  try {
    const db = getDb();
    const sheets = await db
      .select({ sheet: schema.timesheets, project: schema.projects.projectName })
      .from(schema.timesheets)
      .leftJoin(schema.proposals, eq(schema.timesheets.proposalId, schema.proposals.id))
      .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
      .where(eq(schema.timesheets.employerId, uid))
      .orderBy(desc(schema.timesheets.periodStart), desc(schema.timesheets.createdAt));

    if (sheets.length > 0) {
      const internIds = Array.from(new Set(sheets.map((t) => t.sheet.internId)));
      const [unlocked, users] = await Promise.all([
        hiredInternIds(db, uid),
        db
          .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
          .from(schema.users)
          .where(inArray(schema.users.id, internIds)),
      ]);
      const byId = new Map(users.map((u) => [u.id, u]));
      rows = sheets.map(({ sheet, project }) => {
        const u = byId.get(sheet.internId);
        const first = (u?.firstName ?? "").trim();
        const last = (u?.lastName ?? "").trim();
        const ini = initialsOf(first, last);
        const days = dayDetails(sheet.entries, sheet.periodStart, sheet.periodEnd);
        return {
          id: sheet.id,
          internId: sheet.internId,
          name: displayNameOf({ fullName: `${first} ${last}`.trim() || "Intern", initials: ini }, unlocked.has(sheet.internId)),
          initials: ini === "?" ? "I" : ini,
          project,
          period: formatPeriod(sheet.periodStart, sheet.periodEnd),
          status: sheet.status,
          submittedAt: sheet.submittedAt,
          present: days.filter((d) => d.status === "Present").length,
          hours: days.reduce((n, d) => n + d.hours, 0),
          days: days.length,
          internNote: sheet.internNote,
        };
      });
    }
  } catch (err) {
    console.error("[employer/timesheets] load failed", err);
    return (
      <div>
        <PageHead title="Timesheets" />
        <EmptyScene
          art
          title="Couldn't load timesheets"
          body="Your interns' hours are safe; we just couldn't reach them right now. Reload the page in a moment."
          who="Us - a connection problem"
        />
      </div>
    );
  }

  const queue = rows
    .filter((r) => r.status === "submitted")
    .sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));
  const rest = rows.filter((r) => r.status !== "submitted");

  return (
    <div>
      <PageHead
        title="Timesheets"
        lede={
          queue.length
            ? `${queue.length} timesheet${queue.length === 1 ? " is" : "s are"} waiting for your review. Interns are paid on approved days only.`
            : "Your interns log their days here each month. Approving locks them for billing and the stipend."
        }
      />

      {rows.length === 0 ? (
        <EmptyScene
          art
          title="No timesheets yet"
          body="Once a hire starts work, they send a timesheet for each month of the internship. It lands here for you to approve."
          next={{ label: "See your hires", href: "/employer/orders" }}
          who="Your interns - nothing submitted yet"
        />
      ) : (
        <div className="space-y-8">
          {queue.length > 0 ? (
            <section>
              <SectionHead title="Waiting for your review" hint="Oldest first." />
              <Surface className="overflow-hidden">
                <SheetHead />
                <ul className="divide-y divide-ink-100">
                  {queue.map((r) => (
                    <SheetRow key={r.id} row={r} review />
                  ))}
                </ul>
              </Surface>
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section>
              <SectionHead title={queue.length ? "Everything else" : "All timesheets"} />
              <Surface className="overflow-hidden">
                <SheetHead />
                <ul className="divide-y divide-ink-100">
                  {rest.map((r) => (
                    <SheetRow key={r.id} row={r} />
                  ))}
                </ul>
              </Surface>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Intern · period · days · hours · status · action, aligned down the list. */
const SHEET_GRID = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_7rem_5rem_8rem_7rem]";

function SheetHead() {
  return (
    <div aria-hidden className={`${SHEET_GRID} hidden gap-x-6 border-b border-ink-100 px-5 py-2.5 text-xs font-medium text-text-subtle lg:grid`}>
      <span>Intern and period</span>
      <span className="text-right">Days present</span>
      <span className="text-right">Hours</span>
      <span>Status</span>
      <span />
    </div>
  );
}

function SheetRow({ row, review = false }: { row: Row; review?: boolean }) {
  const href = `/employer/timesheets/${encodeURIComponent(row.id)}`;
  return (
    <li className={`${SHEET_GRID} relative grid items-center gap-x-6 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-ink-50/70`}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-800">
          {row.initials}
        </span>
        <div className="min-w-0">
          {/* The row opens the sheet; the link is stretched over it. */}
          <Link
            href={href}
            className="block truncate text-[0.9375rem] font-semibold text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
          >
            {row.name}
          </Link>
          <p className="nums truncate text-sm text-ink-600">
            {row.period}
            {row.project ? ` · ${row.project}` : ""}
            {review && row.submittedAt ? ` · sent ${formatDay(row.submittedAt)}` : ""}
          </p>
        </div>
      </div>
      <p className="nums text-sm text-ink-700 max-lg:col-span-2 max-lg:pl-12 lg:text-right">
        <span className="font-semibold text-ink-900">{row.present}</span>
        <span className="text-text-subtle"> / {row.days}</span>
        <span className="lg:sr-only"> days present</span>
        <span className="lg:hidden"> · {row.hours} h</span>
      </p>
      <p className="nums text-sm font-semibold text-ink-900 max-lg:hidden lg:text-right">
        {row.hours}
        <span className="sr-only"> hours</span>
      </p>
      <div className="max-lg:col-start-2 max-lg:row-start-1 max-lg:justify-self-end lg:col-auto">
        <StatusPill status={row.status} />
      </div>
      <div className="relative z-10 flex justify-end max-lg:col-span-2 max-lg:justify-start max-lg:pl-12">
        {review ? (
          <Link href={href} className={buttonClass({ size: "sm" })}>
            Review
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </li>
  );
}
