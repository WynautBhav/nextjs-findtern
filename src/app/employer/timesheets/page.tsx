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
import { EmptyScene, PageHead, SectionHead, StatTile, Surface } from "@/components/app/primitives";
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
  const approved = rows.filter((r) => r.status === "approved");
  const approvedHours = approved.reduce((n, r) => n + r.hours, 0);

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Waiting for review" value={queue.length > 0 ? queue.length : null} empty="Nothing waiting" />
            <StatTile label="Approved" value={approved.length} />
            <StatTile
              label="Approved hours"
              value={approvedHours > 0 ? approvedHours.toLocaleString("en-IN") : null}
              empty="None yet"
              className="col-span-2 lg:col-span-1"
            />
          </div>

          {queue.length > 0 ? (
            <section>
              <SectionHead title="Waiting for your review" hint="Oldest first." />
              <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
                {queue.map((r) => (
                  <li key={r.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-5">
                    <SheetSummary row={r} />
                    <Link href={`/employer/timesheets/${encodeURIComponent(r.id)}`} className={buttonClass({ size: "sm", className: "self-start sm:self-auto" })}>
                      Review
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </li>
                ))}
              </Surface>
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section>
              <SectionHead title={queue.length ? "Everything else" : "All timesheets"} />
              <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
                {rest.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/employer/timesheets/${encodeURIComponent(r.id)}`}
                      className="group flex flex-col gap-3 p-5 transition-colors hover:bg-ink-50/70 sm:flex-row sm:items-center sm:gap-5"
                    >
                      <SheetSummary row={r} />
                      <ArrowRight className="hidden size-4 shrink-0 text-ink-300 group-hover:text-brand-700 sm:block" aria-hidden />
                    </Link>
                  </li>
                ))}
              </Surface>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SheetSummary({ row }: { row: Row }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3.5">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-800">
        {row.initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[0.9375rem] font-semibold text-ink-900">{row.name}</p>
          <StatusPill status={row.status} />
        </div>
        <p className="nums mt-0.5 text-sm text-ink-600">
          {row.period}
          {row.project ? ` · ${row.project}` : ""}
        </p>
        <p className="nums mt-1 text-sm text-ink-700">
          <span className="font-semibold text-ink-900">{row.present}</span> of {row.days} days present ·{" "}
          <span className="font-semibold text-ink-900">{row.hours}</span> h
          {row.status === "submitted" && row.submittedAt ? <span className="text-ink-500"> · sent {formatDay(row.submittedAt)}</span> : null}
        </p>
        {row.internNote ? <p className="mt-1.5 line-clamp-1 text-sm text-ink-600">&ldquo;{row.internNote}&rdquo;</p> : null}
      </div>
    </div>
  );
}
