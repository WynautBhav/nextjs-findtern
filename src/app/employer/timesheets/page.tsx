import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { ArrowRight } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { dayDetails, formatDay, formatPeriod } from "@/lib/employer-timesheets";
import { StatusPill } from "@/components/employer/timesheet-parts";
import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
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
  masked: boolean;
  project: string | null;
  period: string;
  status: string;
  submittedAt: Date | null;
  present: number;
  hours: number;
  days: number;
  /** Per day of the period, in order: was the intern present. */
  ribbon: boolean[];
  internNote: string | null;
};

/**
 * Timesheet review queue: the daily-use screen. What is waiting on you comes
 * first, oldest submission first, with one button each; everything else
 * follows newest first. Scoped by `timesheets.employer_id`, as legacy was.
 */
export default async function EmployerTimesheets({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const uid = session.uid;
  // "Timesheets" on a hire's row links here with ?intern=<id>. The employer scope below still applies,
  // so an id that isn't one of their interns simply matches nothing.
  const internParam = (await searchParams).intern;
  const onlyIntern = typeof internParam === "string" && /^[0-9a-f-]{36}$/i.test(internParam) ? internParam : null;

  let rows: Row[] = [];
  try {
    const db = getDb();
    const sheets = await db
      .select({ sheet: schema.timesheets, project: schema.projects.projectName })
      .from(schema.timesheets)
      .leftJoin(schema.proposals, eq(schema.timesheets.proposalId, schema.proposals.id))
      .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
      // A draft is the intern's own work in progress; the employer sees a sheet once it is sent (legacy did the same).
      .where(and(eq(schema.timesheets.employerId, uid), ne(schema.timesheets.status, "draft"), onlyIntern ? eq(schema.timesheets.internId, onlyIntern) : undefined))
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
          name: unlocked.has(sheet.internId) ? displayNameOf({ id: sheet.internId, fullName: `${first} ${last}`.trim() || "Intern", initials: ini }, true) : `Candidate ${ini === "?" ? "" : ini}`.trim(),
          initials: ini === "?" ? "I" : ini,
          masked: !unlocked.has(sheet.internId),
          project,
          period: formatPeriod(sheet.periodStart, sheet.periodEnd),
          status: sheet.status,
          submittedAt: sheet.submittedAt,
          present: days.filter((d) => d.status === "Present").length,
          hours: days.reduce((n, d) => n + d.hours, 0),
          days: days.length,
          ribbon: days.map((d) => d.status === "Present"),
          internNote: sheet.internNote,
        };
      });
    }
  } catch (err) {
    console.error("[employer/timesheets] load failed", err);
    return (
      <div>
        <PageHead title="Timesheets" />
        <LoadError what="your timesheets" retryHref={onlyIntern ? `/employer/timesheets?intern=${encodeURIComponent(onlyIntern)}` : "/employer/timesheets"} email={SITE.adminEmail} />
      </div>
    );
  }

  const queue = rows
    .filter((r) => r.status === "submitted")
    .sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));
  const rest = rows.filter((r) => r.status !== "submitted");
  const queueHours = queue.reduce((n, r) => n + r.hours, 0);
  const approvedHours = rows.filter((r) => r.status === "approved").reduce((n, r) => n + r.hours, 0);
  const oldest = queue[0]?.submittedAt ?? null;

  return (
    <div>
      <PageHead
        title="Timesheets"
        lede={
          onlyIntern
            ? rows[0]
              ? `Showing ${rows[0].name}'s timesheets only.`
              : "Showing one intern's timesheets only."
            : "Interns are paid on approved hours only."
        }
        action={
          onlyIntern ? (
            <Link href="/employer/timesheets" className={buttonClass({ variant: "outline", size: "sm" })}>
              Show everyone
            </Link>
          ) : undefined
        }
      />

      {rows.length === 0 && onlyIntern ? (
        <EmptyScene
          title="No sent timesheets for this intern"
          body="Nothing from them is waiting here yet. A month shows up once they send it for approval. Use Show everyone, above, to see all your interns."
          next={{ label: "Show everyone", href: "/employer/timesheets" }}
          who="Your intern - nothing sent yet"
        />
      ) : rows.length === 0 ? (
        <EmptyScene
          title="No timesheets yet"
          body="Once a hire starts work, they send a timesheet for each month of the internship. It lands here for you to approve."
          next={{ label: "See your hires", href: "/employer/orders" }}
          who="Your interns - nothing submitted yet"
        />
      ) : (
        <div className="space-y-10">
          <Overview
            lead={
              queue.length > 0 ? (
                <LeadStat
                  label="Hours waiting for your approval"
                  value={
                    <>
                      <RollingNumber value={queueHours} />
                      <span className="ml-1.5 font-sans text-lg font-medium tracking-normal text-ink-700">h</span>
                    </>
                  }
                  note={`${queue.length} timesheet${queue.length === 1 ? "" : "s"} to decide${oldest ? `, the oldest sent ${formatDay(oldest)}` : ""}.`}
                  tone="signal"
                />
              ) : (
                <LeadStat
                  label="Hours approved"
                  value={
                    <>
                      <RollingNumber value={approvedHours} />
                      <span className="ml-1.5 font-sans text-lg font-medium tracking-normal text-ink-700">h</span>
                    </>
                  }
                  note="Nothing is waiting on you. A new sheet lands here when an intern sends their month."
                  tone="brand"
                />
              )
            }
            rest={
              <StatList
                items={[
                  ...(queue.length > 0 && approvedHours > 0 ? [{ label: "Hours approved", value: approvedHours, hint: "Locked for billing" }] : []),
                  { label: "Timesheets sent", value: rows.length, hint: "Drafts stay with the intern" },
                ]}
              />
            }
          />

          {queue.length > 0 ? (
            <Section title="Waiting for your review" hint="Oldest first.">
              <SheetHead />
              <ul>
                {queue.map((r, i) => (
                  <SheetRow key={r.id} row={r} review primary={i === 0} />
                ))}
              </ul>
            </Section>
          ) : null}

          {rest.length > 0 ? (
            <Section title={queue.length ? "Everything else" : "All timesheets"}>
              <SheetHead />
              <ul>
                {rest.map((r) => (
                  <SheetRow key={r.id} row={r} />
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Intern and period · days · hours · status · action, aligned down the list. */
const SHEET_GRID = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_9rem_5.5rem_8rem_7.5rem]";

function SheetHead() {
  return (
    <div aria-hidden className={`${SHEET_GRID} hidden gap-x-6 pb-2 text-xs text-ink-600 lg:grid`}>
      <span>Intern and period</span>
      <span>Days present</span>
      <span className="text-right">Hours</span>
      <span>Status</span>
      <span />
    </div>
  );
}

function SheetRow({ row, review = false, primary = false }: { row: Row; review?: boolean; primary?: boolean }) {
  const href = `/employer/timesheets/${encodeURIComponent(row.id)}`;
  return (
    <li className={`${SHEET_GRID} relative grid items-center gap-x-6 gap-y-2 border-t border-ink-200 py-4 transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/30`}>
      <div className="min-w-0">
        {/* The row opens the sheet; the link is stretched over it. */}
        <Link
          href={href}
          className="block break-words font-display text-lg font-semibold text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-700"
        >
          {row.name}
        </Link>
        <p className="nums text-sm text-ink-700">
          {row.period}
          {row.project ? ` · ${row.project}` : ""}
          {review && row.submittedAt ? ` · sent ${formatDay(row.submittedAt)}` : ""}
        </p>
        {row.internNote && review ? <p className="mt-1 line-clamp-1 text-sm text-ink-600">Intern says: {row.internNote}</p> : null}
      </div>
      <div className="max-lg:order-2 max-lg:col-span-2">
        <p className="nums text-sm text-ink-700">
          <span className="font-semibold text-ink-900">{row.present}</span> of {row.days}
          <span className="sr-only"> days present</span>
        </p>
        {row.days > 0 ? (
          <div aria-hidden className="mt-1.5 flex h-2.5 max-w-56 gap-px">
            {row.ribbon.map((on, i) => (
              <span key={i} className={on ? "flex-1 rounded-sm bg-brand-700" : "flex-1 rounded-sm bg-ink-300"} />
            ))}
          </div>
        ) : null}
      </div>
      <p className="nums font-display text-2xl font-semibold leading-none text-ink-900 max-lg:hidden lg:text-right">
        {row.hours}
        <span className="ml-1 font-sans text-sm font-medium text-ink-600">h<span className="sr-only">ours</span></span>
      </p>
      <div className="max-lg:col-start-2 max-lg:row-start-1 max-lg:justify-self-end">
        <StatusPill status={row.status} />
      </div>
      <div className="relative z-10 flex justify-end max-lg:order-3 max-lg:col-span-2 max-lg:justify-start">
        {review ? (
          <Link href={href} className={buttonClass({ size: "sm", variant: primary ? "primary" : "outline", className: "min-h-11" })} aria-label={`Review ${row.name}, ${row.period}`}>
            Review
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </li>
  );
}
