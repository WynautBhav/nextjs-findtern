import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { driveWindow } from "@/lib/college/access";
import { getDb, schema } from "@/lib/db";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { HeroFigure, HeroPanel } from "@/components/employer/kit/hero-panel";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { CollegeMark, DriveStatePill, KIND_LABEL, driveTime, timeLeft } from "@/components/employer/drive-parts";
import { compareDrives } from "@/lib/college/access";

export const metadata: Metadata = {
  title: "Campus drives",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Drives this company has entered from a college's link. */
export default async function EmployerDrivesPage() {
  const session = await requireRole("employer");
  let rows: {
    drive: typeof schema.collegeDrives.$inferSelect;
    college: typeof schema.colleges.$inferSelect;
    joinedAt: Date;
  }[] = [];
  let failed = false;
  try {
    rows = await getDb()
      .select({ drive: schema.collegeDrives, college: schema.colleges, joinedAt: schema.collegeDriveEmployers.joinedAt })
      .from(schema.collegeDriveEmployers)
      .innerJoin(schema.collegeDrives, eq(schema.collegeDrives.id, schema.collegeDriveEmployers.driveId))
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
      .where(eq(schema.collegeDriveEmployers.employerId, session.uid))
      .orderBy(desc(schema.collegeDrives.endsAt));
    // Live first, then upcoming, then past (QA-013's order, shared).
    rows.sort((a, b) => compareDrives(a.drive, b.drive));
  } catch (err) {
    console.error("[employer/drives]", err);
    failed = true;
  }

  const states = rows.map(({ drive, college }) => (college.isActive ? driveWindow(drive) : "revoked"));
  const liveCount = states.filter((x) => x === "live").length;
  const upcomingCount = states.filter((x) => x === "upcoming").length;

  return (
    <div>
      <PageHead title="Campus drives" />
      {failed ? (
        <LoadError what="your drives" retryHref="/employer/drives" email={SITE.adminEmail} />
      ) : rows.length === 0 ? (
        <EmptyScene
          title="No drives yet"
          body="Colleges on Findtern share a drive link with the companies they invite. Open that link while signed in and the drive appears here."
          who="The college's placement office sends the link"
        />
      ) : (
        <>
          <HeroPanel className="rise mb-6">
            <div className="grid gap-6 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
              <HeroFigure lead label="Drives open now" value={liveCount} hint={liveCount ? "Students are visible to you in each" : "Nothing is open at the moment"} />
              <HeroFigure label="Opening soon" value={upcomingCount} />
              <HeroFigure label="All drives" value={rows.length} />
            </div>
          </HeroPanel>
          {/* minmax(0,1fr): a grid track's minimum is its content, and the one-line
              title counted at full length, so the column grew to 668px on a phone (QA-118). */}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
            {rows.map(({ drive, college }, i) => {
              // A switched-off college's drives read as closed, as the drive itself refuses (QA-201).
              const state = states[i];
              const left = state === "live" ? timeLeft(drive.endsAt) : null;
              const open = state === "live";
              const body = (
                <div className="flex h-full items-start gap-4 p-5">
                  <CollegeMark name={college.name} logoUrl={college.logoUrl} className="size-12" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DriveStatePill state={state} />
                      <span className="text-xs font-medium text-text-subtle">{KIND_LABEL[drive.kind] ?? "Campus drive"}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 break-words text-lg font-semibold tracking-tight text-ink-900">{drive.title}</p>
                    <p className="mt-1 text-sm text-ink-600">
                      {college.name}
                      {college.city ? `, ${college.city}` : ""}
                    </p>
                    <p className="nums mt-3 text-sm font-medium text-ink-800">
                      {state === "upcoming" ? `Opens ${driveTime(drive.startsAt)}` : `Closes ${driveTime(drive.endsAt)}`}
                      {left ? <span className="font-normal text-brand-700"> · {left}</span> : null}
                    </p>
                  </div>
                  {open ? <ArrowUpRight className="size-5 shrink-0 text-brand-700" aria-hidden /> : null}
                </div>
              );
              const tile = "rise block h-full rounded-[24px] border border-ink-200/70 bg-white shadow-tile";
              return (
                <li key={drive.id} style={{ "--i": i } as React.CSSProperties}>
                  {open ? (
                    <Link
                      href={`/employer/drives/${drive.id}`}
                      className={`${tile} tile-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600`}
                    >
                      {body}
                    </Link>
                  ) : (
                    // Not dimmed with opacity: that pushed already-quiet text
                    // under AA (3.81:1); the state pill says it is closed.
                    <div className={tile}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
