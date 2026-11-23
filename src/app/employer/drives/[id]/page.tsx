import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { driveWindow } from "@/lib/college/access";
import { driveForEmployer, eligibleStudents } from "@/lib/college/scope";
import { DriveActions, DriveStats } from "@/components/employer/campus/drive-overview";
import { getDb, schema } from "@/lib/db";
import { HeroPanel } from "@/components/employer/kit/hero-panel";
import { EmptyScene } from "@/components/app/primitives";
import { CollegeMark, DriveStatePill, driveTime, timeLeft } from "@/components/employer/drive-parts";
import { DriveBenefits } from "@/components/employer/campus/drive-benefits";
import { driveCountdown } from "@/lib/college/drive-pricing";
import { fullTimeReady } from "@/lib/college/eligibility";
import { logDriveViewOncePerDay } from "@/lib/college/campus-lock";
import { DriveAssociation } from "@/components/employer/drive-association";

export const metadata: Metadata = {
  title: "Campus drive",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const NOT_STARTED = { title: "This drive hasn't opened yet", body: "Come back at the opening time. Nothing to do until then." };

/**
 * The Virtual drive overview: what the drive gives the company (15% off, 1% full-time fee, Findtern Pro), how it is
 * going (its numbers in this drive) and the next things to do. The students themselves are on the regular Candidates
 * page, locked to this college while the drive runs (lib/college/campus-lock.ts), and the company hires through the
 * regular flow. Access is re-checked on every load (src/lib/college/access.ts).
 */

export default async function EmployerDrivePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("employer");
  const { id } = await params;
  const loaded = await driveForEmployer(id, session);
  if (!loaded) notFound();
  const { drive, college, access, joined, exited } = loaded;
  const state = driveWindow(drive);

  const left = state === "live" ? timeLeft(drive.endsAt) : null;
  const header = (
    <HeroPanel className="rise mb-6">
      <p className="text-xs font-medium text-on-dark-subtle">Campus drive, in association with {college.name}</p>
      <div className="mt-4 flex items-start gap-4">
        <CollegeMark name={college.name} logoUrl={college.logoUrl} className="hidden sm:grid" />
        <div className="min-w-0 flex-1">
          <h1 className="text-balance text-[clamp(1.75rem,3.6vw,2.75rem)] font-light leading-tight tracking-[-0.03em]">{drive.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-on-dark-subtle">
            <DriveStatePill state={state} />
            <span>Interns and full-time</span>
            <span aria-hidden>·</span>
            <span className="nums">
              Closes {driveTime(drive.endsAt)}
              {left ? ` (${left})` : ""}
            </span>
          </div>
        </div>
      </div>
      {access.ok && state === "live" ? <DriveBenefits driveId={drive.id} collegeName={college.name} daysRemaining={driveCountdown(drive.endsAt).daysRemaining} /> : null}
    </HeroPanel>
  );

  if (!access.ok) {
    // Once a drive is over for this company (ended, closed by the college, or left) its page is gone, also by URL
    // (owner, 23 Nov). The one page left is the wait before a joined drive opens. A company that never joined learns
    // nothing about the drive either way.
    if (!joined || exited || access.reason !== "not_started") notFound();
    return (
      <div>
        {header}
        <EmptyScene title={NOT_STARTED.title} body={NOT_STARTED.body} next={{ label: "Browse candidates", href: "/employer/candidates" }} />
      </div>
    );
  }

  const db = getDb();
  const students = await eligibleStudents(drive);
  const ids = students.map((s) => s.userId);
  const finalYear = students.filter((s) => fullTimeReady(s)).length;
  const p = schema.proposals;
  const [[offers], [shortlisted], [meetings]] = await Promise.all([
    // This company's offers from this drive (stamped with its id when sent).
    db
      .select({
        sent: sql<number>`count(*) FILTER (WHERE lower(btrim(${p.status})) <> 'draft')::int`,
        accepted: sql<number>`count(*) FILTER (WHERE lower(btrim(${p.status})) IN ('accepted', 'processing'))::int`,
        hired: sql<number>`count(*) FILTER (WHERE ${p.hiredAt} IS NOT NULL OR lower(btrim(${p.status})) = 'hired')::int`,
        fullTime: sql<number>`count(*) FILTER (WHERE jsonb_typeof(${p.offerDetails}->'fullTimeOffer') = 'object')::int`,
      })
      .from(p)
      .where(and(eq(p.employerId, session.uid), eq(p.driveId, drive.id))),
    // Its regular shortlist, counting this drive's students.
    ids.length
      ? db
          .select({ n: sql<number>`count(DISTINCT ${schema.employerCartItems.internId})::int` })
          .from(schema.employerCartItems)
          .where(and(eq(schema.employerCartItems.employerId, session.uid), inArray(schema.employerCartItems.internId, ids)))
      : Promise.resolve([{ n: 0 }]),
    ids.length
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.interviews)
          .where(and(eq(schema.interviews.employerId, session.uid), inArray(schema.interviews.internId, ids)))
      : Promise.resolve([{ n: 0 }]),
  ]);
  // The officer's activity log: the company opened its drive (once a day is enough to read).
  after(() => logDriveViewOncePerDay(drive.id, drive.collegeId, session.uid));

  return (
    <div>
      <DriveAssociation collegeName={college.name} logoUrl={college.logoUrl} />
      {header}
      <DriveStats
        stats={[
          { label: "Students in the drive", value: students.length, href: "/employer/candidates" },
          { label: "Final year, for full-time", value: finalYear, href: "/employer/candidates?track=full_time" },
          { label: "Shortlisted", value: shortlisted?.n ?? 0, href: "/employer/cart" },
          { label: "Interviews", value: meetings?.n ?? 0, href: "/employer/schedule" },
          { label: "Offers sent", value: offers?.sent ?? 0, href: "/employer/proposals" },
          { label: "Hired", value: offers?.hired ?? 0, href: "/employer/proposals?status=hired" },
        ]}
      />
      <DriveActions
        collegeName={college.name}
        actions={[
          { title: "Browse interns", body: `All ${students.length} students of ${college.name}, scored and ready to hire.`, href: "/employer/candidates", primary: true },
          { title: "Hire full-time", body: `${finalYear} final-year students. A full-time offer costs 1% of CTC here.`, href: "/employer/candidates?track=full_time" },
          { title: "Your shortlist", body: "Compare the students you saved and send proposals.", href: "/employer/cart" },
          { title: "Proposals and hires", body: `${offers?.sent ?? 0} sent, ${offers?.accepted ?? 0} accepted, ${offers?.hired ?? 0} hired from this drive.`, href: "/employer/proposals" },
          { title: "Interviews", body: "Book and run interviews with the students you like.", href: "/employer/schedule" },
        ]}
      />
    </div>
  );
}
